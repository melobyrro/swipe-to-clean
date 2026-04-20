import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireCsrf, requireSession } from '../auth/middleware';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '../auth/session';
import type { AppConfig } from '../config';
import type { AppDatabase } from '../db';
import type { ImmichClient } from '../immich/client';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler, HttpError } from '../utils/http';
import { createRateLimit } from '../utils/rate-limit';
import { parseBody, EmailSchema, ImmichBaseUrlSchema, PasswordSchema } from '../utils/validation';

const SetupApiKeySchema = z.object({
  baseUrl: ImmichBaseUrlSchema,
  apiKey: z.string().min(1),
  yearsBack: z.coerce.number().int().min(1).max(50),
  timezone: z.string().min(1)
});

const SetupPasswordSchema = z.object({
  baseUrl: ImmichBaseUrlSchema,
  email: EmailSchema,
  password: PasswordSchema,
  yearsBack: z.coerce.number().int().min(1).max(50),
  timezone: z.string().min(1)
});

const ApiKeyLoginSchema = z.object({
  apiKey: z.string().min(1)
});

const PasswordLoginSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema
});

async function issueSession(res: Parameters<typeof setSessionCookie>[0], config: AppConfig, email: string) {
  const sessionPayload = {
    userId: 1,
    email,
    csrfToken: randomUUID()
  };
  const sessionToken = await createSessionToken(sessionPayload, config.appSecret);
  setSessionCookie(res, sessionToken, config);

  return sessionPayload;
}

function hasMatchingSetupToken(candidate: string | undefined, expected: string): boolean {
  if (!candidate) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

function assertSetupToken(req: Request, config: AppConfig) {
  if (!config.setupToken) {
    return;
  }

  const providedToken = req.header('x-setup-token');
  if (!hasMatchingSetupToken(providedToken, config.setupToken)) {
    throw new HttpError(403, 'Valid setup token required before first-run configuration');
  }
}

export function createAuthRouter(database: AppDatabase, config: AppConfig, immich: ImmichClient) {
  const router = Router();
  const authLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

  router.post(
    '/api/auth/setup/apikey',
    authLimiter,
    asyncHandler(async (req, res) => {
      if (database.getImmichConnection()) {
        throw new HttpError(409, 'Immich connection is already configured');
      }

      assertSetupToken(req, config);
      const body = parseBody(SetupApiKeySchema, req.body);
      await immich.storeApiKeyConnection(body.baseUrl, body.apiKey);
      database.updateSettings({
        yearsBack: body.yearsBack,
        timezone: body.timezone
      });
      const sessionPayload = await issueSession(res, config, 'Immich API key');

      res.status(201).json({
        csrfToken: sessionPayload.csrfToken,
        adminEmail: sessionPayload.email
      });
    })
  );

  router.post(
    '/api/auth/setup/login',
    authLimiter,
    asyncHandler(async (req, res) => {
      if (database.getImmichConnection()) {
        throw new HttpError(409, 'Immich connection is already configured');
      }

      assertSetupToken(req, config);
      const body = parseBody(SetupPasswordSchema, req.body);
      await immich.storePasswordConnection(body.baseUrl, body.email, body.password);
      database.updateSettings({
        yearsBack: body.yearsBack,
        timezone: body.timezone
      });
      const sessionPayload = await issueSession(res, config, body.email);

      res.status(201).json({
        csrfToken: sessionPayload.csrfToken,
        adminEmail: sessionPayload.email
      });
    })
  );

  router.post(
    '/api/auth/login/apikey',
    authLimiter,
    asyncHandler(async (req, res) => {
      if (!database.getImmichConnection()) {
        throw new HttpError(404, 'Immich setup is required before login');
      }

      const body = parseBody(ApiKeyLoginSchema, req.body);
      const sessionEmail = await immich.authenticateStoredApiKey(body.apiKey);
      const sessionPayload = await issueSession(res, config, sessionEmail);

      res.json({
        csrfToken: sessionPayload.csrfToken,
        adminEmail: sessionPayload.email
      });
    })
  );

  router.post(
    '/api/auth/login/password',
    authLimiter,
    asyncHandler(async (req, res) => {
      if (!database.getImmichConnection()) {
        throw new HttpError(404, 'Immich setup is required before login');
      }

      const body = parseBody(PasswordLoginSchema, req.body);
      const sessionEmail = await immich.authenticateStoredPassword(body.email, body.password);
      const sessionPayload = await issueSession(res, config, sessionEmail);

      res.json({
        csrfToken: sessionPayload.csrfToken,
        adminEmail: sessionPayload.email
      });
    })
  );

  router.post(
    '/api/auth/logout',
    requireSession,
    requireCsrf,
    asyncHandler(async (_req, res) => {
      clearSessionCookie(res, config);
      res.status(204).end();
    })
  );

  router.get(
    '/api/auth/me',
    asyncHandler(async (req, res) => {
      const session = (req as AuthenticatedRequest).session;
      if (!session) {
        throw new HttpError(401, 'Authentication required');
      }

      res.json({
        email: session.email
      });
    })
  );

  return router;
}
