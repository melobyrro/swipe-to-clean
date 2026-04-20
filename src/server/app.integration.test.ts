import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from './config';
import { MemoryCacheStore } from './cache/store';
import { createApp } from './app';
import { AppDatabase } from './db';
import { ImmichClient } from './immich/client';
import { ReviewService } from './services/review-service';
import { startMockImmichServer } from './test-support/mock-immich';

describe('app integration', () => {
  let directory: string;
  let database: AppDatabase;
  let config: AppConfig;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'swipe-to-clean-app-'));
    config = loadTestConfig(path.join(directory, 'test.db'));
    database = new AppDatabase(config);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('supports API key setup, queue loading, media proxying, and trash failure persistence', async () => {
    const mockImmich = await startMockImmichServer({
      failDeleteIds: ['fail-trash'],
      searchResults: {
        '2024-04-17T00:00:00.000Z|2024-04-17T23:59:59.999Z': [
          {
            id: 'image-1',
            type: 'IMAGE',
            originalFileName: 'image-1.jpg',
            fileCreatedAt: '2024-04-17T12:00:00.000Z',
            localDateTime: '2024-04-17T08:00:00.000Z',
            originalMimeType: 'image/jpeg',
            duration: null,
            width: 100,
            height: 100,
            thumbhash: null,
            isFavorite: false,
            isArchived: false
          },
          {
            id: 'fail-trash',
            type: 'VIDEO',
            originalFileName: 'fail-trash.mp4',
            fileCreatedAt: '2024-04-17T11:00:00.000Z',
            localDateTime: '2024-04-17T07:00:00.000Z',
            originalMimeType: 'video/mp4',
            duration: '00:00:05.000',
            width: 100,
            height: 100,
            thumbhash: null,
            isFavorite: false,
            isArchived: false
          }
        ],
        '2025-04-17T00:00:00.000Z|2025-04-17T23:59:59.999Z': []
      }
    });

    const cache = new MemoryCacheStore();
    const immich = new ImmichClient(database, config);
    const reviewService = new ReviewService(database, cache, immich);
    const app = createApp({
      config,
      database,
      cache,
      immich,
      reviewService
    });
    const agent = request.agent(app);

    const unauthenticatedState = await request(app).get('/api/state');
    expect(unauthenticatedState.body.bootstrapped).toBe(false);
    expect(unauthenticatedState.body.adminEmail).toBeNull();
    expect(unauthenticatedState.body.connectionMode).toBeNull();
    expect(unauthenticatedState.body.setupTokenRequired).toBe(false);
    expect(unauthenticatedState.header['cache-control']).toBe('no-store');

    const setupResponse = await agent.post('/api/auth/setup/apikey').send({
      baseUrl: mockImmich.baseUrl,
      apiKey: 'good-key',
      yearsBack: 2,
      timezone: 'UTC'
    });
    expect(setupResponse.status).toBe(201);
    const csrfToken = setupResponse.body.csrfToken as string;

    const healthResponse = await request(app).get('/api/healthz');
    expect(healthResponse.status).toBe(200);

    const readyResponse = await request(app).get('/api/readyz');
    expect(readyResponse.status).toBe(200);

    const missingCsrf = await agent.put('/api/settings').send({ yearsBack: 2, timezone: 'UTC' });
    expect(missingCsrf.status).toBe(403);

    const queueResponse = await agent.get('/api/review/queue?for=2026-04-17');
    expect(queueResponse.status).toBe(200);
    expect(queueResponse.header['cache-control']).toBe('no-store');
    expect(queueResponse.body.items).toHaveLength(2);
    expect(queueResponse.body.items[0].id).toBe('image-1');

    const proxyResponse = await agent.get('/api/media/image-1/thumbnail?size=preview');
    expect(proxyResponse.status).toBe(200);
    expect(proxyResponse.header['content-type']).toContain('image/png');

    const keepResponse = await agent.post('/api/review/actions').set('x-csrf-token', csrfToken).send({
      assetId: 'image-1',
      action: 'keep',
      queueDate: '2026-04-17'
    });
    expect(keepResponse.status).toBe(200);
    expect(keepResponse.body.state).toBe('keep');

    const trashResponse = await agent.post('/api/review/actions').set('x-csrf-token', csrfToken).send({
      assetId: 'fail-trash',
      action: 'trash',
      queueDate: '2026-04-17',
      asset: queueResponse.body.items[1]
    });
    expect(trashResponse.status).toBe(200);
    expect(trashResponse.body.state).toBe('trash_failed');

    const refreshedQueue = await agent.get('/api/review/queue?for=2026-04-17');
    expect(refreshedQueue.body.failedActions).toHaveLength(1);

    const logoutWithoutCsrf = await agent.post('/api/auth/logout');
    expect(logoutWithoutCsrf.status).toBe(403);

    const logout = await agent.post('/api/auth/logout').set('x-csrf-token', csrfToken);
    expect(logout.status).toBe(204);

    const loginResponse = await agent.post('/api/auth/login/apikey').send({ apiKey: 'good-key' });
    expect(loginResponse.status).toBe(200);

    const authenticatedState = await agent.get('/api/state');
    expect(authenticatedState.body.authenticated).toBe(true);
    expect(authenticatedState.body.connectionMode).toBe('apiKey');

    await mockImmich.close();
  });

  it('supports password-based Immich setup and login', async () => {
    const mockImmich = await startMockImmichServer();
    const cache = new MemoryCacheStore();
    const immich = new ImmichClient(database, config);
    const reviewService = new ReviewService(database, cache, immich);
    const app = createApp({
      config,
      database,
      cache,
      immich,
      reviewService
    });
    const agent = request.agent(app);

    const setupResponse = await agent.post('/api/auth/setup/login').send({
      baseUrl: mockImmich.baseUrl,
      email: 'immich@example.com',
      password: 'password123',
      yearsBack: 10,
      timezone: 'UTC'
    });
    expect(setupResponse.status).toBe(201);

    const logout = await agent.post('/api/auth/logout').set('x-csrf-token', setupResponse.body.csrfToken);
    expect(logout.status).toBe(204);

    const response = await agent.post('/api/auth/login/password').send({
      email: 'immich@example.com',
      password: 'password123'
    });

    expect(response.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('immich@example.com');

    await mockImmich.close();
  });

  it('requires the setup token before first-run configuration when one is configured', async () => {
    const securedConfig = {
      ...config,
      setupToken: 'setup-token-123456'
    } satisfies AppConfig;
    const mockImmich = await startMockImmichServer();
    const cache = new MemoryCacheStore();
    const immich = new ImmichClient(database, securedConfig);
    const reviewService = new ReviewService(database, cache, immich);
    const app = createApp({
      config: securedConfig,
      database,
      cache,
      immich,
      reviewService
    });
    const agent = request.agent(app);

    const state = await agent.get('/api/state');
    expect(state.body.setupTokenRequired).toBe(true);

    const missingToken = await agent.post('/api/auth/setup/apikey').send({
      baseUrl: mockImmich.baseUrl,
      apiKey: 'good-key',
      yearsBack: 2,
      timezone: 'UTC'
    });
    expect(missingToken.status).toBe(403);

    const response = await agent.post('/api/auth/setup/apikey').set('x-setup-token', 'setup-token-123456').send({
      baseUrl: mockImmich.baseUrl,
      apiKey: 'good-key',
      yearsBack: 2,
      timezone: 'UTC'
    });
    expect(response.status).toBe(201);

    await mockImmich.close();
  });
});

function loadTestConfig(databasePath: string): AppConfig {
  return {
    nodeEnv: 'test',
    port: 3001,
    appSecret: 'test-secret-1234567890',
    setupToken: null,
    databasePath,
    redisUrl: 'redis://127.0.0.1:6379',
    redisRequired: false,
    sessionCookieName: 'test_session',
    immichTimeoutMs: 5_000,
    secureCookies: false
  };
}
