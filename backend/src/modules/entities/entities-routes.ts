import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { authGuard, publicGuard } from '#/middlewares/guard';
import { checkSlugBodySchema } from '#/modules/entities/entities-schema';
import {
  errorResponseRefs,
  publicStreamQuerySchema,
  streamNotificationResponseSchema,
  streamQuerySchema,
} from '#/schemas';
import { mockStreamResponse } from '../../../mocks/mock-me';

const entityRoutes = {
  /**
   * Check slug availability
   */
  checkSlug: createXRoute({
    operationId: 'checkSlug',
    method: 'post',
    path: '/check-slug',
    xGuard: authGuard,
    tags: ['entities'],
    summary: 'Check slug availability',
    description: `Checks whether a given slug is available across all entity types (e.g. *organizations*, *users*).
      Primarily used to prevent slug collisions before creating or updating an entity.`,
    request: {
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
   * Public stream for all public entity changes (no auth required)
   */
  publicStream: createXRoute({
    operationId: 'getPublicStream',
    method: 'get',
    path: '/public/stream',
    xGuard: publicGuard,
    tags: ['entities'],
    summary: 'Public entity stream',
    description:
      'Stream real-time changes for public entities (entities with no parent context). No authentication required. Use offset for catch-up, live=sse for SSE streaming.',
    request: { query: publicStreamQuerySchema },
    responses: {
      200: {
        description: 'Catch-up activities or SSE stream started',
        content: {
          'application/json': {
            schema: streamNotificationResponseSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * App event stream (authenticated user stream)
   */
  appStream: createXRoute({
    operationId: 'getAppStream',
    method: 'get',
    path: '/app/stream',
    xGuard: authGuard,
    tags: ['entities'],
    summary: 'App event stream',
    description:
      'SSE stream for membership and entity notifications affecting the *current user*. Sends lightweight notifications - client fetches entity data via API.',
    request: {
      query: streamQuerySchema,
    },
    responses: {
      200: {
        description: 'SSE stream or notification response',
        content: {
          'text/event-stream': { schema: z.any() },
          'application/json': {
            schema: streamNotificationResponseSchema,
            example: mockStreamResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};
export default entityRoutes;
