import { Router } from 'express';
import type { AppConfig } from '../config';
import type { AppDatabase } from '../db';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/http';

export function createStateRouter(database: AppDatabase, config: AppConfig) {
  const router = Router();

  router.get(
    '/api/state',
    asyncHandler(async (req, res) => {
      const session = (req as AuthenticatedRequest).session;
      const settings = database.getSettings();
      const connection = database.getImmichConnection();

      res.json({
        bootstrapped: Boolean(connection),
        authenticated: Boolean(session),
        hasImmichConnection: Boolean(connection),
        setupTokenRequired: Boolean(config.setupToken && !connection),
        csrfToken: session?.csrfToken ?? null,
        settings,
        adminEmail: session?.email ?? null,
        connectionMode: connection?.mode ?? null
      });
    })
  );

  return router;
}
