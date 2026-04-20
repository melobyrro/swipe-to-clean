import { z, type ZodSchema } from 'zod';
import { HttpError } from './http';

export function parseBody<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((issue) => issue.message).join(', '));
  }

  return result.data;
}

export const EmailSchema = z.string().email();
export const PasswordSchema = z.string().min(8);

function normalizeBaseUrl(url: URL): string {
  const normalizedPath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${normalizedPath}`;
}

export const ImmichBaseUrlSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Immich base URL must be a valid http or https URL'
      });
      return;
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Immich base URL must use http or https'
      });
    }

    if (url.username || url.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Immich base URL cannot include embedded credentials'
      });
    }

    if (url.search || url.hash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Immich base URL cannot include query parameters or fragments'
      });
    }
  })
  .transform((value) => normalizeBaseUrl(new URL(value)));
