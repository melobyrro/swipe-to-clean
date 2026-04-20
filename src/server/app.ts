import path from 'node:path';
import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config';
import type { CacheStore } from './cache/store';
import { optionalSession, requireCsrf, requireSession } from './auth/middleware';
import type { AppDatabase } from './db';
import type { ImmichClient } from './immich/client';
import { createAuthRouter } from './routes/auth';
import { createMediaRouter } from './routes/media';
import { createOpsRouter } from './routes/ops';
import { createReviewRouter } from './routes/review';
import { createSetupRouter } from './routes/setup';
import { createStateRouter } from './routes/state';
import type { AuthenticatedRequest } from './types';
import type { ReviewService } from './services/review-service';
import { HttpError } from './utils/http';

export function createApp(deps: {
  config: AppConfig;
  database: AppDatabase;
  cache: CacheStore;
  immich: ImmichClient;
  reviewService: ReviewService;
}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      }
    })
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(optionalSession(deps.config));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      if (!req.path.startsWith('/api') || req.path === '/api/healthz') {
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const userId = (req as AuthenticatedRequest).session?.userId ?? null;

      console.log(
        JSON.stringify({
          level: 'info',
          event: 'http_request',
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          ip: req.ip,
          userId
        })
      );
    });

    next();
  });

  app.use(createOpsRouter(deps.database, deps.cache));
  app.use(createStateRouter(deps.database, deps.config));
  app.use(createAuthRouter(deps.database, deps.config, deps.immich));

  app.use(['/api/setup', '/api/settings', '/api/review/actions'], requireSession, requireCsrf);
  app.use(['/api/review', '/api/media'], requireSession);

  app.use(createSetupRouter(deps.database, deps.immich));
  app.use(createReviewRouter(deps.reviewService));
  app.use(createMediaRouter(deps.immich));

  if (deps.config.nodeEnv === 'production') {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    app.use(
      express.static(clientDist, {
        index: false,
        maxAge: '1y',
        immutable: true
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
