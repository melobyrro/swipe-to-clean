import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import type { ImmichClient } from '../immich/client';
import { asyncHandler, HttpError } from '../utils/http';

const VALID_SIZES = new Set(['thumbnail', 'preview', 'fullsize']);

export function createMediaRouter(immich: ImmichClient) {
  const router = Router();

  router.get(
    '/api/media/:assetId/thumbnail',
    asyncHandler(async (req, res) => {
      const assetId = req.params.assetId;
      const size = typeof req.query.size === 'string' ? req.query.size : 'preview';
      if (!VALID_SIZES.has(size)) {
        throw new HttpError(400, 'Invalid thumbnail size');
      }

      const query = new URLSearchParams({ size });
      const upstream = await immich.fetchAssetMedia(`/api/assets/${assetId}/thumbnail`, {
        query
      });
      await proxyResponse(upstream, res, true);
    })
  );

  router.get(
    '/api/media/:assetId/original',
    asyncHandler(async (req, res) => {
      const assetId = req.params.assetId;
      const headers: Record<string, string> = {};
      const rangeHeader = req.header('range');
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }

      const upstream = await immich.fetchAssetMedia(`/api/assets/${assetId}/original`, {
        headers
      });
      await proxyResponse(upstream, res, false);
    })
  );

  return router;
}

async function proxyResponse(upstream: Response, res: import('express').Response, cachePreview: boolean) {
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (['connection', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
      return;
    }

    res.setHeader(key, value);
  });
  res.setHeader('Cache-Control', cachePreview ? 'private, max-age=300' : 'private, max-age=60');

  if (!upstream.body) {
    res.end();
    return;
  }

  await pipeline(Readable.fromWeb(upstream.body as never), res);
}
