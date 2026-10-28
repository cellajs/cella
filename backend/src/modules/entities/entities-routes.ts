import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, streamConnectLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockCatchupResponse } from '#/modules/entities/entities-mocks';
import { checkSlugBodySchema } from '#/modules/entities/entities-schema';
import { appCatchupResponseSchema, streamCatchupBodySchema, tenantOnlyParamSchema } from '#/schemas';

const entityRoutes = createXRoutes(['entities', 'cella'], {
  checkSlug: xRoute({
    method: 'post',
    path: '/{tenantId}/check-slug',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Check slug availability',
    description:
      'Checks whether a given slug is available for the specified entity type. A slug is unique across all tenants. Primarily used to prevent slug collisions before creating or updating an entity.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(checkSlugBodySchema) },
    responses: { 204: { description: 'Slug is available' } },
  }),

  appStream: xRoute({
    operationId: 'getAppStream',
    method: 'get',
    path: '/app/stream',
    xGuard: [userGuard],
    xRateLimiter: [streamConnectLimiter],
    summary: 'App SSE stream',
    description:
      'SSE stream of what changed for the current user, with ids only: a `change` event for product rows it may read, a `signal` event for anything else, such as its own memberships and inbox.',
    responses: { 200: { description: 'SSE stream started', content: { 'text/event-stream': { schema: z.any() } } } },
  }),

  appCatchup: xRoute({
    operationId: 'postAppCatchup',
    method: 'post',
    path: '/app/stream',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'App stream catchup',
    description:
      'Fetch what a client missed since its last sync: frontiers and counts per declared view (prefix sets + org-sequence cursors in the body), and per organization the versions of its versioned signals.',
    request: { body: jsonBody(streamCatchupBodySchema) },
    responses: { 200: json('Catchup summary', appCatchupResponseSchema, mockCatchupResponse()) },
  }),
});

export { entityRoutes };
