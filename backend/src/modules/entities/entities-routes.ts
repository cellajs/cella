import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, tenantGuard } from '#/middlewares/guard';
import { singlePointsLimiter, streamConnectLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockStreamResponse } from '#/modules/entities/entities-mocks';
import { checkSlugBodySchema } from '#/modules/entities/entities-schema';
import { appCatchupResponseSchema, errorResponseRefs, streamCatchupBodySchema, tenantOnlyParamSchema } from '#/schemas';

const entityRoutes = {
  checkSlug: createXRoute({
    operationId: 'checkSlug',
    method: 'post',
    path: '/{tenantId}/check-slug',
    xGuard: [authGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['entities', 'cella'],
    summary: 'Check slug availability',
    description: `Checks whether a given slug is available within a tenant for the specified entity type.
      Primarily used to prevent slug collisions before creating or updating an entity.`,
    request: {
      params: tenantOnlyParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: checkSlugBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'Slug is available',
      },
      ...errorResponseRefs,
    },
  }),

  appStream: createXRoute({
    operationId: 'getAppStream',
    method: 'get',
    path: '/app/stream',
    xGuard: [authGuard],
    xRateLimiter: [streamConnectLimiter],
    tags: ['entities', 'cella'],
    summary: 'App event SSE stream',
    description:
      'SSE stream for membership and entity notifications affecting the current user. Sends lightweight notifications.',
    responses: {
      200: {
        description: 'SSE stream started',
        content: {
          'text/event-stream': { schema: z.any() },
        },
      },
      ...errorResponseRefs,
    },
  }),

  appCatchup: createXRoute({
    operationId: 'postAppCatchup',
    method: 'post',
    path: '/app/stream',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['entities', 'cella'],
    summary: 'App event catchup',
    description:
      'Fetch missed entity and membership changes since last sync. Send cursor and declared views (prefix sets + org-sequence cursors) in the body.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: streamCatchupBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Catchup summary',
        content: {
          'application/json': {
            schema: appCatchupResponseSchema,
            example: mockStreamResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export { entityRoutes };
