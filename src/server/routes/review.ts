import { Router } from 'express';
import { z } from 'zod';
import type { ReviewService } from '../services/review-service';
import { asyncHandler } from '../utils/http';
import { normalizeAssetStub } from '../utils/assets';
import { parseBody } from '../utils/validation';

const ReviewActionSchema = z.object({
  assetId: z.string().min(1),
  action: z.enum(['keep', 'trash', 'retry-trash']),
  queueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  asset: z.unknown().optional()
});

const QueueQuerySchema = z.object({
  for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export function createReviewRouter(reviewService: ReviewService) {
  const router = Router();

  router.get(
    '/api/review/queue',
    asyncHandler(async (req, res) => {
      const query = parseBody(QueueQuerySchema, req.query);
      const forDate = query.for;
      const body = await reviewService.getQueue(forDate ?? new Date().toISOString().slice(0, 10));
      res.json(body);
    })
  );

  router.post(
    '/api/review/actions',
    asyncHandler(async (req, res) => {
      const body = parseBody(ReviewActionSchema, req.body);
      const asset = normalizeAssetStub(body.asset) ?? undefined;
      const result = await reviewService.performAction({
        ...body,
        asset
      });
      res.json(result);
    })
  );

  return router;
}
