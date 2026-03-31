import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { appConfig, hierarchy } from 'shared';
import { nanoid } from 'shared/nanoid';
import { type Env } from '#/lib/context';
import { publicEntityCache } from '#/middlewares/entity-cache';
import {
  type AppStreamSubscriber,
  dispatchToUserSubscribers,
  fetchUserCatchupSummary,
  getLatestUserActivityId,
  orgChannel,
} from '#/modules/entities/app-stream';
import entityRoutes from '#/modules/entities/entities-routes';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import {
  dispatchToPublicSubscribers,
  fetchPublicCatchupSummary,
  getLatestPublicActivityId,
  type PublicStreamSubscriber,
  publicChannel,
} from '#/modules/entities/public-stream';
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { keepAlive, streamSubscriberManager, writeOffset } from '#/sync/stream';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// ActivityBus registration for app stream (authenticated user events)
// ============================================

// All product entity + membership events route through dispatchToUserSubscribers
const appStreamHandler = async (event: ActivityEventWithEntity) => {
  try {
    await dispatchToUserSubscribers(event);
  } catch (error) {
    logEvent(null, 'error', 'Failed to dispatch app stream event', { error, activityId: event.id });
  }
};

for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, appStreamHandler);
  }
}
for (const action of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`membership.${action}`, appStreamHandler);
}

// ============================================
// ActivityBus registration for public entity stream
// ============================================

for (const entityType of hierarchy.publicReadTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event: ActivityEventWithEntity) => {
      if (event.entityId) publicEntityCache.delete(entityType, event.entityId);
      try {
        await dispatchToPublicSubscribers(event);
      } catch (error) {
        logEvent(null, 'error', 'Failed to dispatch public entity event', { error, activityId: event.id });
      }
    });
  }
}

// ============================================
// Route handlers
// ============================================

/**
 * Check if slug is available among page entities (context entities + users)
 */
app.openapi(entityRoutes.checkSlug, async (ctx) => {
  const db = ctx.var.db;

  const { slug, entityType } = ctx.req.valid('json');

  const slugAvailable = await checkSlugAvailable(db, slug, entityType);

  return slugAvailable ? ctx.body(null, 204) : ctx.body(null, 409);
});

/**
 * Public SSE stream (live updates only)
 */
app.openapi(entityRoutes.publicStream, async (ctx) => {
  const cursor = await getLatestPublicActivityId();

  return streamSSE(ctx, async (stream) => {
    ctx.header('Content-Encoding', '');

    // Send offset marker immediately (live mode ready)
    await writeOffset(stream, cursor);

    // Register subscriber on all public entity channels
    const channels = hierarchy.publicReadTypes.map((t) => publicChannel(t));
    const subscriber: PublicStreamSubscriber = {
      id: nanoid(),
      channel: channels[0] ?? 'public:default',
      stream,
      cursor,
    };

    // Register on all public channels
    streamSubscriberManager.register(subscriber, channels.slice(1));
    logEvent(ctx, 'info', 'Public stream subscriber registered', { subscriberId: subscriber.id });

    // Handle disconnect
    stream.onAbort(() => {
      streamSubscriberManager.unregister(subscriber.id);
      logEvent(ctx, 'info', 'Public stream subscriber disconnected', { subscriberId: subscriber.id });
    });

    // Keep connection alive
    await keepAlive(stream);
    // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
  }) as any;
});

/**
 * Public catchup (POST with body)
 */
app.openapi(entityRoutes.publicCatchup, async (ctx) => {
  const { cursor, seqs } = ctx.req.valid('json');
  const resolvedCursor = cursor ?? null;
  const summary = await fetchPublicCatchupSummary(resolvedCursor, seqs);
  return ctx.json(summary);
});

/**
 * App SSE stream (live updates only, authenticated)
 */
app.openapi(entityRoutes.appStream, async (ctx) => {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const sessionToken = ctx.var.sessionToken;
  const organizationIds = new Set(memberships.map((m) => m.organizationId));

  const cursor = await getLatestUserActivityId(user.id, organizationIds);

  // SSE streaming mode — no inline catchup, client catches up first via POST
  return streamSSE(ctx, async (stream) => {
    ctx.header('Content-Encoding', '');

    // Send offset marker immediately (live mode ready)
    await writeOffset(stream, cursor);

    // Build subscriber with memberships for permission checks
    // Primary channel is first org channel (or empty if no orgs)
    const orgChannels = [...organizationIds].map((id) => orgChannel(id));
    const subscriber: AppStreamSubscriber = {
      id: nanoid(),
      channel: orgChannels[0] ?? '',
      stream,
      userId: user.id,
      sessionToken,
      organizationIds,
      isSystemAdmin,
      memberships,
      cursor,
    };

    // Register on all org channels - all events (including memberships) route through org channels
    // NOTE: If user is added to new org while connected, they won't receive events for that
    // org until reconnect. Frontend should reconnect stream when membership.created is received.
    streamSubscriberManager.register(subscriber, orgChannels.slice(1));
    logEvent(ctx, 'info', 'App stream subscriber registered', {
      subscriberId: subscriber.id,
      orgCount: organizationIds.size,
    });

    // Handle disconnect
    stream.onAbort(() => {
      streamSubscriberManager.unregister(subscriber.id);
      logEvent(ctx, 'info', 'App stream subscriber disconnected', { subscriberId: subscriber.id });
    });

    // Keep connection alive
    await keepAlive(stream);
    // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
  }) as any;
});

/**
 * App catchup (POST with body)
 */
app.openapi(entityRoutes.appCatchup, async (ctx) => {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  const { cursor, seqs } = ctx.req.valid('json');
  const organizationIds = new Set(memberships.map((m) => m.organizationId));

  // Build project ID sets per organization for project-level catchup drill-down
  const projectIdsByOrg = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (m.projectId) {
      let set = projectIdsByOrg.get(m.organizationId);
      if (!set) {
        set = new Set();
        projectIdsByOrg.set(m.organizationId, set);
      }
      set.add(m.projectId);
    }
  }

  const resolvedCursor = cursor ?? null;
  const summary = await fetchUserCatchupSummary(user.id, organizationIds, resolvedCursor, seqs, projectIdsByOrg);
  return ctx.json(summary);
});

export { entityTag } from '#/modules/entities/entities-module';
export const entityHandlers = app;
