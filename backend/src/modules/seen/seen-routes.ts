import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, syncReadLimiter } from '#/middlewares/rate-limiter/limiters';
import { seenBatchBodySchema, seenBatchResponseSchema, unseenCountsResponseSchema } from '#/modules/seen/seen-schema';
import { tenantOrgParamSchema } from '#/schemas';

const seenRoutes = createXRoutes(['seen', 'cella'], {
  markSeen: xRoute({
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Mark entities as seen',
    description:
      'Records that the current user has viewed one or more product entities. ' +
      'Deduplicates against existing records. Updates entity view counts for newly seen entities.',
    request: { params: tenantOrgParamSchema, body: jsonBody(seenBatchBodySchema) },
    responses: { 200: json('Seen records processed', seenBatchResponseSchema) },
  }),
  getUnseenCounts: xRoute({
    method: 'get',
    path: '/counts',
    xGuard: [userGuard],
    xRateLimiter: [syncReadLimiter],
    summary: 'Get unseen counts',
    description:
      'Returns the number of unseen product entities per parent channel entity (e.g., project) and entity type for the current user. ' +
      'Computed within the rolling seen window so entities older than seen_by retention do not participate.',
    responses: { 200: json('Unseen counts per parent channel entity per entity type', unseenCountsResponseSchema) },
  }),
});

export { seenRoutes };
