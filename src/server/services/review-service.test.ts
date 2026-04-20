import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetStub } from '../../shared/contracts';
import { MemoryCacheStore } from '../cache/store';
import { loadConfig } from '../config';
import { AppDatabase } from '../db';
import { ReviewService } from './review-service';

const assetA: AssetStub = {
  id: 'asset-a',
  type: 'IMAGE',
  originalFileName: 'a.jpg',
  fileCreatedAt: '2025-04-17T10:00:00.000Z',
  localDateTime: '2025-04-17T06:00:00.000Z',
  duration: null,
  width: 100,
  height: 100,
  thumbhash: null,
  isFavorite: false,
  isArchived: false
};

const assetB: AssetStub = {
  id: 'asset-b',
  type: 'IMAGE',
  originalFileName: 'b.jpg',
  fileCreatedAt: '2024-04-17T10:00:00.000Z',
  localDateTime: '2024-04-17T06:00:00.000Z',
  duration: null,
  width: 100,
  height: 100,
  thumbhash: null,
  isFavorite: false,
  isArchived: false
};

describe('ReviewService', () => {
  let directory: string;
  let database: AppDatabase;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'swipe-to-clean-'));
    database = new AppDatabase({
      databasePath: path.join(directory, 'test.db')
    });
    database.updateSettings({
      yearsBack: 2,
      timezone: 'UTC'
    });
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('sorts results newest-first and filters previously reviewed assets', async () => {
    const cache = new MemoryCacheStore();
    const immich = {
      searchByDateWindow: async (window: { takenAfter: string }) => {
        const items = window.takenAfter.startsWith('2024') ? [assetB] : [assetA];
        return {
          assets: {
            total: items.length,
            count: items.length,
            items
          }
        };
      },
      deleteAsset: async () => undefined
    } as never;
    const reviewService = new ReviewService(database, cache, immich);

    database.upsertReviewState({
      assetId: assetB.id,
      state: 'keep',
      queueDate: '2026-04-17',
      asset: assetB
    });

    const queue = await reviewService.getQueue('2026-04-17');

    expect(queue.totalCount).toBe(2);
    expect(queue.completedCount).toBe(1);
    expect(queue.items.map((item) => item.id)).toEqual(['asset-a']);
  });

  it('resolves keep actions from the cached queue when the client omits the asset payload', async () => {
    const cache = new MemoryCacheStore();
    const immich = {
      searchByDateWindow: async (window: { takenAfter: string }) => {
        const items = window.takenAfter.startsWith('2024') ? [assetB] : [assetA];
        return {
          assets: {
            total: items.length,
            count: items.length,
            items
          }
        };
      },
      deleteAsset: async () => undefined
    } as never;
    const reviewService = new ReviewService(database, cache, immich);

    await reviewService.getQueue('2026-04-17');
    const result = await reviewService.performAction({
      assetId: assetA.id,
      action: 'keep',
      queueDate: '2026-04-17'
    });

    expect(result.state).toBe('keep');
    expect(database.getReviewSnapshot(assetA.id)).toEqual({
      state: 'keep',
      queueDate: '2026-04-17',
      asset: assetA
    });
  });
});
