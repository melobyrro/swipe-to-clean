import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { AppSettings, AssetStub, FailedActionItem, ImmichConnectionMode, ReviewState } from '../../shared/contracts';
import type { AppConfig } from '../config';

export type ImmichConnectionRecord = {
  mode: ImmichConnectionMode;
  baseUrl: string;
  apiKeyEnc: string | null;
  emailEnc: string | null;
  passwordEnc: string | null;
  accessTokenEnc: string | null;
  updatedAt: string;
};

type ReviewRow = {
  asset_id: string;
  state: ReviewState;
  queue_date: string;
  snapshot_json: string;
  error_message: string | null;
  updated_at: string;
};

export class AppDatabase {
  private db: Database.Database;

  constructor(config: AppConfig | { databasePath: string }) {
    prepareDatabasePath(config.databasePath);
    this.db = new Database(config.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        years_back INTEGER NOT NULL DEFAULT 10,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS immich_connection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_enc TEXT,
        email_enc TEXT,
        password_enc TEXT,
        access_token_enc TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asset_review_state (
        asset_id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('keep', 'pending_trash', 'trashed', 'trash_failed')),
        queue_date TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        error_message TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO app_settings (id, years_back, timezone, updated_at)
        VALUES (1, 10, 'UTC', ?)
        ON CONFLICT(id) DO NOTHING
      `
      )
      .run(now);
  }

  close() {
    this.db.close();
  }

  getSettings(): AppSettings {
    const row = this.db
      .prepare<unknown[], { years_back: number; timezone: string }>(
        'SELECT years_back, timezone FROM app_settings WHERE id = 1'
      )
      .get();

    return {
      yearsBack: row?.years_back ?? 10,
      timezone: row?.timezone ?? 'UTC'
    };
  }

  updateSettings(settings: AppSettings): AppSettings {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO app_settings (id, years_back, timezone, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          years_back = excluded.years_back,
          timezone = excluded.timezone,
          updated_at = excluded.updated_at
      `
      )
      .run(settings.yearsBack, settings.timezone, now);

    return settings;
  }

  getImmichConnection(): ImmichConnectionRecord | null {
    const row = this.db
      .prepare<
        unknown[],
        {
          mode: ImmichConnectionMode;
          base_url: string;
          api_key_enc: string | null;
          email_enc: string | null;
          password_enc: string | null;
          access_token_enc: string | null;
          updated_at: string;
        }
      >(
        `
        SELECT mode, base_url, api_key_enc, email_enc, password_enc, access_token_enc, updated_at
        FROM immich_connection
        WHERE id = 1
      `
      )
      .get();

    if (!row) {
      return null;
    }

    return {
      mode: row.mode,
      baseUrl: row.base_url,
      apiKeyEnc: row.api_key_enc,
      emailEnc: row.email_enc,
      passwordEnc: row.password_enc,
      accessTokenEnc: row.access_token_enc,
      updatedAt: row.updated_at
    };
  }

  saveImmichConnection(connection: Omit<ImmichConnectionRecord, 'updatedAt'>) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO immich_connection (id, mode, base_url, api_key_enc, email_enc, password_enc, access_token_enc, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          mode = excluded.mode,
          base_url = excluded.base_url,
          api_key_enc = excluded.api_key_enc,
          email_enc = excluded.email_enc,
          password_enc = excluded.password_enc,
          access_token_enc = excluded.access_token_enc,
          updated_at = excluded.updated_at
      `
      )
      .run(
        connection.mode,
        connection.baseUrl,
        connection.apiKeyEnc,
        connection.emailEnc,
        connection.passwordEnc,
        connection.accessTokenEnc,
        now
      );
  }

  updateImmichAccessToken(accessTokenEnc: string) {
    this.db
      .prepare('UPDATE immich_connection SET access_token_enc = ?, updated_at = ? WHERE id = 1')
      .run(accessTokenEnc, new Date().toISOString());
  }

  upsertReviewState(input: {
    assetId: string;
    state: ReviewState;
    queueDate: string;
    asset: AssetStub;
    errorMessage?: string | null;
  }) {
    this.db
      .prepare(
        `
        INSERT INTO asset_review_state (asset_id, state, queue_date, snapshot_json, error_message, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
          state = excluded.state,
          queue_date = excluded.queue_date,
          snapshot_json = excluded.snapshot_json,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at
      `
      )
      .run(
        input.assetId,
        input.state,
        input.queueDate,
        JSON.stringify(input.asset),
        input.errorMessage ?? null,
        new Date().toISOString()
      );
  }

  getReviewStates(assetIds: string[]): Map<string, ReviewState> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const placeholders = assetIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare<[...string[]], { asset_id: string; state: ReviewState }>(
        `SELECT asset_id, state FROM asset_review_state WHERE asset_id IN (${placeholders})`
      )
      .all(...assetIds);

    return new Map(rows.map((row) => [row.asset_id, row.state]));
  }

  getFailedActions(): FailedActionItem[] {
    const rows = this.db
      .prepare<unknown[], ReviewRow>(
        `
        SELECT asset_id, state, queue_date, snapshot_json, error_message, updated_at
        FROM asset_review_state
        WHERE state = 'trash_failed'
        ORDER BY updated_at DESC
        LIMIT 25
      `
      )
      .all();

    return rows.map((row) => ({
      assetId: row.asset_id,
      state: 'trash_failed',
      errorMessage: row.error_message,
      updatedAt: row.updated_at,
      asset: JSON.parse(row.snapshot_json) as AssetStub
    }));
  }

  getReviewSnapshot(assetId: string): { state: ReviewState; asset: AssetStub; queueDate: string } | null {
    const row = this.db
      .prepare<unknown[], ReviewRow>(
        `
        SELECT asset_id, state, queue_date, snapshot_json, error_message, updated_at
        FROM asset_review_state
        WHERE asset_id = ?
      `
      )
      .get(assetId);

    if (!row) {
      return null;
    }

    return {
      state: row.state,
      asset: JSON.parse(row.snapshot_json) as AssetStub,
      queueDate: row.queue_date
    };
  }
}

function prepareDatabasePath(databasePath: string) {
  const resolvedPath = path.resolve(databasePath);
  const directory = path.dirname(resolvedPath);
  mkdirSync(directory, { recursive: true });

  const legacyRootPath = path.resolve('swipe-to-clean.db');
  const migratedDefaultPath = path.resolve('.local/swipe-to-clean.db');
  if (resolvedPath !== migratedDefaultPath || resolvedPath === legacyRootPath || existsSync(resolvedPath) || !existsSync(legacyRootPath)) {
    return;
  }

  for (const suffix of ['', '-shm', '-wal']) {
    const source = `${legacyRootPath}${suffix}`;
    const target = `${resolvedPath}${suffix}`;
    if (!existsSync(source) || existsSync(target)) {
      continue;
    }

    renameSync(source, target);
  }
}
