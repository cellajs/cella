import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, publicGuard, tenantGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { checkSlugBodySchema } from '#/modules/entities/entities-schema';
import { mockStreamResponse } from '#/modules/me/me-mocks';
import {
  appCatchupResponseSchema,
  errorResponseRefs,
  publicCatchupResponseSchema,
  streamCatchupBodySchema,
  tenantOnlyParamSchema,
} from '#/schemas';

const entityRoutes = {
  /**
   * Check slug availability
   */
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

  /**
   * Public SSE stream (live updates, no auth required)
   */
  publicStream: createXRoute({
    operationId: 'getPublicStream',
    method: 'get',
    path: '/public/stream',
    xGuard: [publicGuard],
    tags: ['entities', 'cella'],
    summary: 'Public entity SSE stream',
    description: 'SSE stream for real-time public entity changes. No authentication required.',
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

  /**
   * Public catchup (POST with body)
   */
  publicCatchup: createXRoute({
    operationId: 'postPublicCatchup',
    method: 'post',
    path: '/public/stream',
    xGuard: [publicGuard],
    tags: ['entities', 'cella'],
    summary: 'Public entity catchup',
    description: 'Fetch missed public entity changes since last sync. Send cursor and per-scope seqs in the body.',
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
            schema: publicCatchupResponseSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * App SSE stream (live updates, authenticated)
   */
  appStream: createXRoute({
    operationId: 'getAppStream',
    method: 'get',
    path: '/app/stream',
    xGuard: [authGuard],
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

  /**
   * App catchup (POST with body)
   */
  appCatchup: createXRoute({
    operationId: 'postAppCatchup',
    method: 'post',
    path: '/app/stream',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['entities', 'cella'],
    summary: 'App event catchup',
    description:
      'Fetch missed entity and membership changes since last sync. Send cursor and per-scope seqs in the body.',
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
export default entityRoutes;
