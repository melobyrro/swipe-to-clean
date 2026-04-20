import type { RequestHandler } from 'express';
import { HttpError } from './http';

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimit(options: { windowMs: number; max: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, _res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      return next();
    }

    if (bucket.count >= options.max) {
      return next(new HttpError(429, 'Too many requests. Please slow down and try again.'));
    }

    bucket.count += 1;
    return next();
  };
}
