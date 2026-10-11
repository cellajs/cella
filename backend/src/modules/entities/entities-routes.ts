import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, streamConnectLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockStreamResponse } from '#/modules/entities/entities-mocks';
import { checkSlugBodySchema } from '#/modules/entities/entities-schema';
import { appCatchupResponseSchema, streamCatchupBodySchema, tenantOnlyParamSchema } from '#/schemas';

const entityRoutes = createXRoutes(['entities', 'cella'], {
  checkSlug: xRoute({
    method: 'post',
    path: '/{tenantId}/check-slug',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Check slug availability',
    description: `Checks whether a given slug is available for the specified entity type. A slug is unique across all tenants.
      Primarily used to prevent slug collisions before creating or updating an entity.`,
    request: { params: tenantOnlyParamSchema, body: jsonBody(checkSlugBodySchema) },
    responses: { 204: { description: 'Slug is available' } },
  }),

  appStream: xRoute({
    operationId: 'getAppStream',
    method: 'get',
    path: '/app/stream',
    xGuard: [userGuard],
    xRateLimiter: [streamConnectLimiter],
    summary: 'App event SSE stream',
    description: 'SSE stream for membership and entity notifications affecting the current user. Sends lightweight notifications.',
    responses: { 200: { description: 'SSE stream started', content: { 'text/event-stream': { schema: z.any() } } } },
  }),

  appCatchup: xRoute({
    operationId: 'postAppCatchup',
    method: 'post',
    path: '/app/stream',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'App event catchup',
    description:
      'Fetch missed entity and membership changes since last sync. Send cursor and declared views (prefix sets + org-sequence cursors) in the body.',
    request: { body: jsonBody(streamCatchupBodySchema) },
    responses: { 200: json('Catchup summary', appCatchupResponseSchema, mockStreamResponse()) },
  }),
});

export { entityRoutes };
