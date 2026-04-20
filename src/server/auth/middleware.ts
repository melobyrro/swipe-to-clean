import type { NextFunction, Request, Response } from 'express';
import { verifySessionToken } from './session';
import type { AppConfig } from '../config';
import { HttpError } from '../utils/http';
import type { AuthenticatedRequest } from '../types';

export function optionalSession(config: AppConfig) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[config.sessionCookieName];
    if (!token) {
      return next();
    }

    try {
      const payload = await verifySessionToken(token, config.appSecret);
      (req as AuthenticatedRequest).session = payload;
    } catch {
      // Ignore invalid cookies here; strict auth will reject later.
    }

    return next();
  };
}

export function requireSession(req: Request, _res: Response, next: NextFunction) {
  if (!(req as AuthenticatedRequest).session) {
    return next(new HttpError(401, 'Authentication required'));
  }

  return next();
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  const session = (req as AuthenticatedRequest).session;
  if (!session) {
    return next(new HttpError(401, 'Authentication required'));
  }

  const headerToken = req.header('x-csrf-token');
  if (!headerToken || headerToken !== session.csrfToken) {
    return next(new HttpError(403, 'Invalid CSRF token'));
  }

  return next();
}
