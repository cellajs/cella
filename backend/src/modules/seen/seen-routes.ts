import { createXRoute } from '#/core/x-routes';
import { authGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, syncReadLimiter } from '#/middlewares/rate-limiter/limiters';
import { seenBatchBodySchema, seenBatchResponseSchema, unseenCountsResponseSchema } from '#/modules/seen/seen-schema';
import { errorResponseRefs, tenantOrgParamSchema } from '#/schemas';

const seenRoutes = {
  /**
   * Mark entities as seen (batch)
   */
  markSeen: createXRoute({
    operationId: 'markSeen',
    method: 'post',
    path: '/',
    xGuard: [authGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    tags: ['seen', 'cella'],
    summary: 'Mark entities as seen',
    description:
      'Records that the current user has viewed one or more product entities. ' +
      'Deduplicates against existing records. Updates entity view counts for newly seen entities.',
    request: {
      params: tenantOrgParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: seenBatchBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Seen records processed',
        content: { 'application/json': { schema: seenBatchResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get unseen counts per parent channel entity per entity type
   */
  getUnseenCounts: createXRoute({
    operationId: 'getUnseenCounts',
    method: 'get',
    path: '/counts',
    xGuard: [authGuard],
    xRateLimiter: [syncReadLimiter],
    tags: ['seen', 'cella'],
    summary: 'Get unseen counts',
    description:
      'Returns the number of unseen product entities per parent channel entity (e.g., project) and entity type for the current user. ' +
      'Computed within the rolling seen window so entities older than seen_by retention do not participate.',
    responses: {
      200: {
        description: 'Unseen counts per parent channel entity per entity type',
        content: { 'application/json': { schema: unseenCountsResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { seenRoutes };
