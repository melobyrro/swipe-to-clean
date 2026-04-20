import type { Request } from 'express';
import type { SessionPayload } from './auth/session';

export type AuthenticatedRequest = Request & {
  session: SessionPayload;
};
