import type { AssetKind, AssetStub } from '../../shared/contracts';

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toAssetKind(value: unknown): AssetKind {
  return value === 'IMAGE' || value === 'VIDEO' || value === 'AUDIO' || value === 'OTHER' ? value : 'OTHER';
}

function isZeroDuration(value: string | null) {
  return value === '0:00:00.00000' || value === '00:00:00.000';
}

export function normalizeAssetStub(value: unknown): AssetStub | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown> & {
    exifInfo?: Record<string, unknown>;
  };

  const id = toStringValue(raw.id);
  const originalFileName = toStringValue(raw.originalFileName);
  const fileCreatedAt = toStringValue(raw.fileCreatedAt);
  const localDateTime = toStringValue(raw.localDateTime) ?? fileCreatedAt;

  if (!id || !originalFileName || !fileCreatedAt || !localDateTime) {
    return null;
  }

  const type = toAssetKind(raw.type);
  const width = toNullableNumber(raw.width) ?? toNullableNumber(raw.exifInfo?.exifImageWidth);
  const height = toNullableNumber(raw.height) ?? toNullableNumber(raw.exifInfo?.exifImageHeight);
  const rawDuration = toStringValue(raw.duration) ?? toStringValue(raw.exifInfo?.duration) ?? null;
  const duration = type === 'IMAGE' && isZeroDuration(rawDuration) ? null : rawDuration;

  return {
    id,
    type,
    originalFileName,
    originalMimeType: toStringValue(raw.originalMimeType),
    fileCreatedAt,
    localDateTime,
    duration,
    width,
    height,
    thumbhash: toStringValue(raw.thumbhash) ?? null,
    isFavorite: Boolean(raw.isFavorite),
    isArchived: Boolean(raw.isArchived)
  };
}
