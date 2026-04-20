import { describe, expect, it } from 'vitest';
import { normalizeAssetStub } from './assets';

describe('normalizeAssetStub', () => {
  it('converts raw Immich search assets into the app asset shape', () => {
    const asset = normalizeAssetStub({
      id: 'raw-1',
      type: 'IMAGE',
      originalFileName: 'IMG_1940.HEIC',
      originalMimeType: 'image/heic',
      fileCreatedAt: '2025-04-18T03:43:52.497Z',
      localDateTime: '2025-04-17T23:43:52.497Z',
      thumbhash: 'thumb',
      isFavorite: false,
      isArchived: false,
      duration: '0:00:00.00000'
    });

    expect(asset).toEqual({
      id: 'raw-1',
      type: 'IMAGE',
      originalFileName: 'IMG_1940.HEIC',
      originalMimeType: 'image/heic',
      fileCreatedAt: '2025-04-18T03:43:52.497Z',
      localDateTime: '2025-04-17T23:43:52.497Z',
      duration: null,
      width: null,
      height: null,
      thumbhash: 'thumb',
      isFavorite: false,
      isArchived: false
    });
  });
});
