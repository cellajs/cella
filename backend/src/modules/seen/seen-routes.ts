import { createXRoute } from '#/docs/x-routes';
import { authGuard, orgGuard, tenantGuard } from '#/middlewares/guard';
import { seenBatchBodySchema, seenBatchResponseSchema } from '#/modules/seen/seen-schema';
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
};

export default seenRoutes;
