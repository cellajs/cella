import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { actorGuard, orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter, streamConnectLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockCatchupResponse } from '#/modules/entities/entities-mocks';
import { channelArchiveBodySchema, checkSlugBodySchema } from '#/modules/entities/entities-schema';
import { batchResponseSchema, streamCatchupBodySchema, streamCatchupResponseSchema, tenantOnlyParamSchema, tenantOrgParamSchema } from '#/schemas';
import { streamChangeSchema, streamErrorSchema, streamSignalSchema } from '#/schemas/stream-schemas';

export const entityRoutes = createXRoutes(['entities', 'cella'], {
  checkSlug: xRoute({
    method: 'post',
    path: '/tenants/{tenantId}/~check-slug',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Check slug availability',
    description:
      'Checks whether a given slug is available for the specified entity type. A slug is unique across all tenants. Primarily used to prevent slug collisions before creating or updating an entity.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(checkSlugBodySchema) },
    responses: { 204: { description: 'Slug is available' }, 409: { description: 'Slug is taken' } },
  }),

  archiveChannel: xRoute({
    method: 'post',
    path: '/tenants/{tenantId}/organizations/{organizationId}/channels/~archive',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Archive channel',
    description:
      'Archives a channel below the organization, which closes it: nobody changes it, creates anything in it or changes a product homed in it, system admins included, until it is unarchived. It still reads and streams, a list shows it when asked to, and a member can still be removed or leave. The channels inside it keep their own state unless `includeDescendants` archives them too. Requires update permission on the channel. The organization is never archived; its tenant is.',
    request: { params: tenantOrgParamSchema, body: jsonBody(channelArchiveBodySchema) },
    responses: {
      200: json(
        'Channel archived\n\n`rejectedIds` lists the channels inside it that the caller reads but may not update, which stay as they were.',
        batchResponseSchema(),
      ),
    },
  }),

  unarchiveChannel: xRoute({
    method: 'post',
    path: '/tenants/{tenantId}/organizations/{organizationId}/channels/~unarchive',
    xGuard: [actorGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Unarchive channel',
    description:
      'Reopens an archived channel below the organization. The channels inside it keep their own state unless `includeDescendants` unarchives them too. Requires update permission on the channel.',
    request: { params: tenantOrgParamSchema, body: jsonBody(channelArchiveBodySchema) },
    responses: {
      200: json(
        'Channel unarchived\n\n`rejectedIds` lists the channels inside it that the caller reads but may not update, which stay as they were.',
        batchResponseSchema(),
      ),
    },
  }),

  getMyStream: xRoute({
    method: 'get',
    path: '/me/stream',
    xGuard: [userGuard],
    xRateLimiter: [streamConnectLimiter],
    summary: 'SSE stream',
    description:
      'SSE stream of what changed for the current user, with ids only: a `change` event for product rows it may read, a `signal` event for anything else, such as its own memberships and inbox.',
    responses: {
      200: {
        description: 'SSE stream started\n\nEach `change`, `signal` or `error` event carries one of these frames as its data.',
        content: { 'text/event-stream': { schema: z.union([streamChangeSchema, streamSignalSchema, streamErrorSchema]) } },
      },
    },
  }),

  catchUpMyStream: xRoute({
    method: 'post',
    path: '/me/stream/~catch-up',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Stream catchup',
    description:
      'Fetch what a client missed since its last sync: a frontier per declared view (an organization, a product type and its org-sequence cursor in the body), and per organization the versions of its versioned signals.',
    request: { body: jsonBody(streamCatchupBodySchema) },
    responses: { 200: json('Catchup summary', streamCatchupResponseSchema, mockCatchupResponse()) },
  }),
});
