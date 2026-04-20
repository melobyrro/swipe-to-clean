import { describe, expect, it } from 'vitest';
import { ImmichBaseUrlSchema } from './validation';

describe('ImmichBaseUrlSchema', () => {
  it('normalizes valid Immich URLs and strips trailing slashes', () => {
    const result = ImmichBaseUrlSchema.parse('https://photos.example.com/immich/');
    expect(result).toBe('https://photos.example.com/immich');
  });

  it('rejects embedded credentials and query strings', () => {
    expect(() => ImmichBaseUrlSchema.parse('https://user:pass@photos.example.com')).toThrow(
      'Immich base URL cannot include embedded credentials'
    );
    expect(() => ImmichBaseUrlSchema.parse('https://photos.example.com?token=secret')).toThrow(
      'Immich base URL cannot include query parameters or fragments'
    );
  });
});
