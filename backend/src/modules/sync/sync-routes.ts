import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasOrgAccess } from '#/middlewares/guard';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { createStreamMessageSchema } from './schema';

/**
 * Query parameters for the live stream endpoint.
 */
const streamQuerySchema = z.object({
  offset: z.string().optional().describe('Cursor offset: "-1" for all history, "now" for live-only, or activity ID'),
  live: z.enum(['sse']).optional().describe('Set to "sse" for live updates (SSE stream)'),
  entityTypes: z.string().optional().describe('Comma-separated entity types to filter (e.g., "page,attachment")'),
});

/**
 * Catch-up response (non-streaming) with activities.
 * Uses z.unknown() for entity data since response can contain multiple entity types.
 */
const catchUpResponseSchema = z.object({
  activities: z.array(createStreamMessageSchema(z.unknown())),
  cursor: z.string().nullable().describe('Last activity ID (use as offset for next request)'),
});

const syncRoutes = {
  /**
   * GET /organizations/:orgIdOrSlug/sync/stream
   * Live stream endpoint for product entity changes.
   */
  stream: createXRoute({
    operationId: 'syncStream',
    method: 'get',
    path: '/organizations/{orgIdOrSlug}/sync/stream',
    xGuard: hasOrgAccess,
    tags: ['sync'],
    summary: 'Live stream of entity changes',
    description:
      'Stream real-time changes for product entities in an organization. Use offset for catch-up, live=sse for SSE streaming.',
    request: {
      params: z.object({
        orgIdOrSlug: z.string().describe('Organization ID or slug'),
      }),
      query: streamQuerySchema,
    },
    responses: {
      200: {
        description: 'Catch-up activities or SSE stream started',
        content: {
          'application/json': {
            schema: catchUpResponseSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default syncRoutes;
