import { Router } from 'express';
import type { CacheStore } from '../cache/store';
import type { AppDatabase } from '../db';
import { asyncHandler } from '../utils/http';

export function createOpsRouter(database: AppDatabase, cache: CacheStore) {
  const router = Router();

  router.get(
    '/api/healthz',
    asyncHandler(async (_req, res) => {
      res.json({ status: 'ok' });
    })
  );

  router.get(
    '/api/readyz',
    asyncHandler(async (_req, res) => {
      database.getSettings();

      const probeKey = `readyz:${Date.now()}`;
      await cache.set(probeKey, 'ok', 5);
      const value = await cache.get(probeKey);
      await cache.del(probeKey);

      if (value !== 'ok') {
        res.status(503).json({ status: 'degraded', message: 'Cache backend is not responding correctly.' });
        return;
      }

      res.json({ status: 'ready' });
    })
  );

  return router;
}
