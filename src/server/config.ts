import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_SECRET: z.string().min(16).default('replace-me-with-a-long-random-secret'),
  SETUP_TOKEN: z.string().trim().optional(),
  DATABASE_PATH: z.string().default('./.local/swipe-to-clean.db'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  REDIS_REQUIRED: z.enum(['true', 'false']).optional(),
  SESSION_COOKIE_NAME: z.string().default('swipe_to_clean_session'),
  IMMICH_TIMEOUT_MS: z.coerce.number().int().positive().default(15000)
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appSecret: string;
  setupToken: string | null;
  databasePath: string;
  redisUrl: string;
  redisRequired: boolean;
  sessionCookieName: string;
  immichTimeoutMs: number;
  secureCookies: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const secureCookies = parsed.NODE_ENV === 'production';
  const setupToken = parsed.SETUP_TOKEN?.trim() || null;
  const redisRequired = parsed.REDIS_REQUIRED
    ? parsed.REDIS_REQUIRED === 'true'
    : parsed.NODE_ENV === 'production';

  if (secureCookies && parsed.APP_SECRET === 'replace-me-with-a-long-random-secret') {
    throw new Error('APP_SECRET must be set to a strong unique value in production');
  }

  if (secureCookies && parsed.APP_SECRET.length < 32) {
    throw new Error('APP_SECRET must be at least 32 characters in production');
  }

  if (setupToken && setupToken.length < 16) {
    throw new Error('SETUP_TOKEN must be at least 16 characters when set');
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    appSecret: parsed.APP_SECRET,
    setupToken,
    databasePath: parsed.DATABASE_PATH,
    redisUrl: parsed.REDIS_URL,
    redisRequired,
    sessionCookieName: parsed.SESSION_COOKIE_NAME,
    immichTimeoutMs: parsed.IMMICH_TIMEOUT_MS,
    secureCookies
  };
}
