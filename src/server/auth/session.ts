import { SignJWT, jwtVerify } from 'jose';
import type { Response } from 'express';
import type { AppConfig } from '../config';

export type SessionPayload = {
  userId: number;
  email: string;
  csrfToken: string;
};

function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret(secret));

  return {
    userId: Number(payload.userId),
    email: String(payload.email),
    csrfToken: String(payload.csrfToken)
  };
}

export function setSessionCookie(response: Response, token: string, config: AppConfig) {
  response.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(response: Response, config: AppConfig) {
  response.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/'
  });
}
