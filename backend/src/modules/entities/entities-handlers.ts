import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { appConfig, hierarchy } from 'shared';
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
import { nanoid } from '#/utils/nanoid';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// ActivityBus registration for public entity stream
// ============================================

// Register listeners dynamically for all public product entity types
for (const entityType of hierarchy.publicAccessTypes) {
  const eventTypes = [`${entityType}.created`, `${entityType}.updated`, `${entityType}.deleted`] as const;

  for (const eventType of eventTypes) {
    activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
      // Invalidate public entity cache
      if (event.entityId) {
        publicEntityCache.delete(entityType, event.entityId);
      }

      // Dispatch to public stream subscribers
      try {
        await dispatchToPublicSubscribers(event);
      } catch (error) {
        logEvent('error', 'Failed to dispatch public entity event', { error, activityId: event.id });
      }
    });
  }
}

// ============================================
// ActivityBus registration for app stream (authenticated user events)
// ============================================

// Membership events - routed via user channel
const membershipEvents = ['membership.created', 'membership.updated', 'membership.deleted'] as const;

for (const eventType of membershipEvents) {
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch membership event', { error, activityId: event.id });
    }
  });
}

// Product entity events - dynamically registered from config
const productEntityActions = ['created', 'updated', 'deleted'] as const;

for (const entityType of appConfig.productEntityTypes) {
  for (const action of productEntityActions) {
    const eventType = `${entityType}.${action}` as const;
    activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
      try {
        await dispatchToUserSubscribers(event);
      } catch (error) {
        logEvent('error', 'Failed to dispatch product entity event', { error, activityId: event.id });
      }
    });
  }
}

// ============================================
// Route handlers
// ============================================

const entitiesRouteHandlers = app
  /**
   * Check if slug is available among page entities (context entities + users)
   */
  .openapi(entityRoutes.checkSlug, async (ctx) => {
    const { slug, entityType } = ctx.req.valid('json');
    const db = ctx.var.db;

    const slugAvailable = await checkSlugAvailable(slug, db, entityType);

    return slugAvailable ? ctx.body(null, 204) : ctx.body(null, 409);
  })
  /**
   * Public SSE stream (live updates only)
   */
  .openapi(entityRoutes.publicStream, async (ctx) => {
    const cursor = await getLatestPublicActivityId();

    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send offset marker immediately (live mode ready)
      await writeOffset(stream, cursor);

      // Register subscriber on all public entity channels
      const channels = hierarchy.publicAccessTypes.map((t) => publicChannel(t));
      const subscriber: PublicStreamSubscriber = {
        id: nanoid(),
        channel: channels[0] ?? 'public:default',
        stream,
        cursor,
      };

      // Register on all public channels
      streamSubscriberManager.register(subscriber, channels.slice(1));
      logEvent('info', 'Public stream subscriber registered', { subscriberId: subscriber.id });

      // Handle disconnect
      stream.onAbort(() => {
        streamSubscriberManager.unregister(subscriber.id);
        logEvent('info', 'Public stream subscriber disconnected', { subscriberId: subscriber.id });
      });

      // Keep connection alive
      await keepAlive(stream);
      // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
    }) as any;
  })
  /**
   * Public catchup (POST with body)
   */
  .openapi(entityRoutes.publicCatchup, async (ctx) => {
    const { cursor, seqs } = ctx.req.valid('json');
    const resolvedCursor = cursor ?? null;
    const summary = await fetchPublicCatchupSummary(resolvedCursor, seqs);
    return ctx.json(summary);
  })
  /**
   * App SSE stream (live updates only, authenticated)
   */
  .openapi(entityRoutes.appStream, async (ctx) => {
    const user = ctx.var.user;
    const memberships = ctx.var.memberships;
    const userSystemRole = ctx.var.userSystemRole;
    const sessionToken = ctx.var.sessionToken;
    const orgIds = new Set(memberships.map((m) => m.organizationId));

    const cursor = await getLatestUserActivityId(user.id, orgIds);

    // SSE streaming mode — no inline catchup, client catches up first via POST
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send offset marker immediately (live mode ready)
      await writeOffset(stream, cursor);

      // Build subscriber with memberships for permission checks
      // Primary channel is first org channel (or empty if no orgs)
      const orgChannels = [...orgIds].map((id) => orgChannel(id));
      const subscriber: AppStreamSubscriber = {
        id: nanoid(),
        channel: orgChannels[0] ?? '',
        stream,
        userId: user.id,
        sessionToken,
        orgIds,
        userSystemRole,
        memberships,
        cursor,
      };

      // Register on all org channels - all events (including memberships) route through org channels
      // NOTE: If user is added to new org while connected, they won't receive events for that
      // org until reconnect. Frontend should reconnect stream when membership.created is received.
      streamSubscriberManager.register(subscriber, orgChannels.slice(1));
      logEvent('info', 'App stream subscriber registered', {
        subscriberId: subscriber.id,
        userId: user.id,
        orgCount: orgIds.size,
      });

      // Handle disconnect
      stream.onAbort(() => {
        streamSubscriberManager.unregister(subscriber.id);
        logEvent('info', 'App stream subscriber disconnected', { subscriberId: subscriber.id, userId: user.id });
      });

      // Keep connection alive
      await keepAlive(stream);
      // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
    }) as any;
  })
  /**
   * App catchup (POST with body)
   */
  .openapi(entityRoutes.appCatchup, async (ctx) => {
    const { cursor, seqs } = ctx.req.valid('json');
    const user = ctx.var.user;
    const memberships = ctx.var.memberships;
    const orgIds = new Set(memberships.map((m) => m.organizationId));
    const resolvedCursor = cursor ?? null;
    const summary = await fetchUserCatchupSummary(user.id, orgIds, resolvedCursor, seqs);
    return ctx.json(summary);
  });

export default entitiesRouteHandlers;
