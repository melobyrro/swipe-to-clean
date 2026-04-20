import { Router } from 'express';
import { z } from 'zod';
import type { AppDatabase } from '../db';
import type { ImmichClient } from '../immich/client';
import { asyncHandler } from '../utils/http';
import { parseBody, EmailSchema, ImmichBaseUrlSchema, PasswordSchema } from '../utils/validation';

const ApiKeySchema = z.object({
  baseUrl: ImmichBaseUrlSchema,
  apiKey: z.string().min(1)
});

const ImmichLoginSchema = z.object({
  baseUrl: ImmichBaseUrlSchema,
  email: EmailSchema,
  password: PasswordSchema
});

const SettingsSchema = z.object({
  yearsBack: z.coerce.number().int().min(1).max(50),
  timezone: z.string().min(1)
});

export function createSetupRouter(database: AppDatabase, immich: ImmichClient) {
  const router = Router();

  router.post(
    '/api/setup/immich/apikey',
    asyncHandler(async (req, res) => {
      const body = parseBody(ApiKeySchema, req.body);
      await immich.storeApiKeyConnection(body.baseUrl, body.apiKey);
      res.status(204).end();
    })
  );

  router.post(
    '/api/setup/immich/login',
    asyncHandler(async (req, res) => {
      const body = parseBody(ImmichLoginSchema, req.body);
      await immich.storePasswordConnection(body.baseUrl, body.email, body.password);
      res.status(204).end();
    })
  );

  router.put(
    '/api/settings',
    asyncHandler(async (req, res) => {
      const body = parseBody(SettingsSchema, req.body);
      const settings = database.updateSettings({
        yearsBack: body.yearsBack,
        timezone: body.timezone
      });
      res.json(settings);
    })
  );

  return router;
}
