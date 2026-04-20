import type { AssetStub, QueueResponse, ReviewActionRequest, ReviewActionResponse, ReviewState } from '../../shared/contracts';
import type { CacheStore } from '../cache/store';
import type { AppDatabase } from '../db';
import type { ImmichClient } from '../immich/client';
import { buildDateWindows, buildQueueHash, secondsUntilEndOfDay } from '../utils/date';
import { HttpError } from '../utils/http';

type QueueCachePayload = {
  items: AssetStub[];
  totalCount: number;
};

type SessionPayload = {
  completedCount: number;
  totalCount: number;
  updatedAt: string;
};

const QUEUE_CACHE_VERSION = 2;

export class ReviewService {
  constructor(
    private database: AppDatabase,
    private cache: CacheStore,
    private immich: ImmichClient
  ) {}

  async getQueue(forDate: string): Promise<QueueResponse> {
    const settings = this.database.getSettings();
    const queueHash = buildQueueHash({
      forDate,
      timezone: settings.timezone,
      yearsBack: settings.yearsBack,
      queueCacheVersion: QUEUE_CACHE_VERSION
    });
    const queueCacheKey = `queue:${forDate}:${queueHash}`;
    const sessionKey = `session:${forDate}:${queueHash}`;
    const ttlSeconds = secondsUntilEndOfDay(settings.timezone);

    const cachedQueue = await this.cache.get(queueCacheKey);
    let queuePayload: QueueCachePayload;

    if (cachedQueue) {
      queuePayload = JSON.parse(cachedQueue) as QueueCachePayload;
    } else {
      queuePayload = await this.generateQueue(forDate, settings.timezone, settings.yearsBack);
      await this.cache.set(queueCacheKey, JSON.stringify(queuePayload), ttlSeconds);
    }

    const reviewStates = this.database.getReviewStates(queuePayload.items.map((item) => item.id));
    const remainingItems = queuePayload.items.filter((item) => !reviewStates.has(item.id));
    const completedCount = queuePayload.totalCount - remainingItems.length;
    const session: SessionPayload = {
      completedCount,
      totalCount: queuePayload.totalCount,
      updatedAt: new Date().toISOString()
    };

    await this.cache.set(sessionKey, JSON.stringify(session), ttlSeconds);

    return {
      queueId: `${forDate}:${queueHash}`,
      forDate,
      yearsBack: settings.yearsBack,
      timezone: settings.timezone,
      totalCount: queuePayload.totalCount,
      completedCount,
      items: remainingItems,
      failedActions: this.database.getFailedActions()
    };
  }

  async performAction(request: ReviewActionRequest): Promise<ReviewActionResponse> {
    if (request.action === 'retry-trash') {
      return this.retryTrash(request.assetId);
    }

    const asset = request.asset ?? (await this.resolveAssetSnapshot(request.assetId, request.queueDate));
    if (!asset) {
      throw new HttpError(409, 'Could not resolve that asset from the active queue. Reload and try again.');
    }

    if (request.action === 'keep') {
      this.database.upsertReviewState({
        assetId: request.assetId,
        state: 'keep',
        queueDate: request.queueDate,
        asset
      });

      return { state: 'keep' };
    }

    return this.trashAsset({
      assetId: request.assetId,
      queueDate: request.queueDate,
      asset
    });
  }

  private async retryTrash(assetId: string): Promise<ReviewActionResponse> {
    const existing = this.database.getReviewSnapshot(assetId);
    if (!existing) {
      throw new HttpError(404, 'No failed trash action exists for this asset');
    }

    return this.trashAsset({
      assetId,
      queueDate: existing.queueDate,
      asset: existing.asset
    });
  }

  private async trashAsset(input: { assetId: string; queueDate: string; asset: AssetStub }): Promise<ReviewActionResponse> {
    const inflightKey = `action:${input.assetId}`;
    const inflight = await this.cache.get(inflightKey);
    if (inflight) {
      throw new HttpError(409, 'That asset is already being processed');
    }

    await this.cache.set(inflightKey, '1', 30);
    this.database.upsertReviewState({
      assetId: input.assetId,
      state: 'pending_trash',
      queueDate: input.queueDate,
      asset: input.asset
    });

    try {
      await this.immich.deleteAsset(input.assetId);
      this.database.upsertReviewState({
        assetId: input.assetId,
        state: 'trashed',
        queueDate: input.queueDate,
        asset: input.asset
      });

      return { state: 'trashed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to trash asset';
      this.database.upsertReviewState({
        assetId: input.assetId,
        state: 'trash_failed',
        queueDate: input.queueDate,
        asset: input.asset,
        errorMessage: message
      });

      return {
        state: 'trash_failed',
        errorMessage: message
      };
    } finally {
      await this.cache.del(inflightKey);
    }
  }

  private async resolveAssetSnapshot(assetId: string, queueDate: string): Promise<AssetStub | null> {
    const existing = this.database.getReviewSnapshot(assetId);
    if (existing) {
      return existing.asset;
    }

    const settings = this.database.getSettings();
    const queueHash = buildQueueHash({
      forDate: queueDate,
      timezone: settings.timezone,
      yearsBack: settings.yearsBack,
      queueCacheVersion: QUEUE_CACHE_VERSION
    });
    const queueCacheKey = `queue:${queueDate}:${queueHash}`;
    const ttlSeconds = secondsUntilEndOfDay(settings.timezone);

    const cachedQueue = await this.cache.get(queueCacheKey);
    if (cachedQueue) {
      const queuePayload = JSON.parse(cachedQueue) as QueueCachePayload;
      return queuePayload.items.find((item) => item.id === assetId) ?? null;
    }

    const regeneratedQueue = await this.generateQueue(queueDate, settings.timezone, settings.yearsBack);
    await this.cache.set(queueCacheKey, JSON.stringify(regeneratedQueue), ttlSeconds);
    return regeneratedQueue.items.find((item) => item.id === assetId) ?? null;
  }

  private async generateQueue(forDate: string, timezone: string, yearsBack: number): Promise<QueueCachePayload> {
    const windows = buildDateWindows(forDate, timezone, yearsBack);
    const results = await Promise.all(windows.map((window) => this.fetchWindowAssets(window)));
    const items = results
      .flat()
      .sort((left, right) => {
        const dateDelta = Date.parse(right.fileCreatedAt) - Date.parse(left.fileCreatedAt);
        if (dateDelta !== 0) {
          return dateDelta;
        }

        return right.id.localeCompare(left.id);
      });

    return {
      items,
      totalCount: items.length
    };
  }

  private async fetchWindowAssets(window: { takenAfter: string; takenBefore: string }): Promise<AssetStub[]> {
    const firstPage = await this.immich.searchByDateWindow(window, 1);
    const total = firstPage.assets.total;
    const pageCount = Math.max(1, Math.ceil(total / 1000));
    const remainingPages = [];

    for (let page = 2; page <= pageCount; page += 1) {
      remainingPages.push(this.immich.searchByDateWindow(window, page));
    }

    const rest = await Promise.all(remainingPages);
    return [firstPage, ...rest].flatMap((result) => result.assets.items);
  }
}
