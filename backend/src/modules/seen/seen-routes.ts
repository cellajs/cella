import { createXRoute } from '#/docs/x-routes';
import { authGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
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
    tags: ['seen'],
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
   * Get unseen counts per org per entity type
   */
  getUnseenCounts: createXRoute({
    operationId: 'getUnseenCounts',
    method: 'get',
    path: '/counts',
    xGuard: authGuard,
    tags: ['seen'],
    summary: 'Get unseen counts',
    description:
      'Returns the number of unseen product entities per organization and entity type for the *current user*. ' +
      'Only entities created within the last 90 days are considered.',
    responses: {
      200: {
        description: 'Unseen counts per org per entity type',
        content: { 'application/json': { schema: unseenCountsResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
};

export default seenRoutes;
