import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { appConfig, hierarchy } from 'shared';
import { signCacheToken } from '#/lib/cache-token-signer';
import { type Env } from '#/lib/context';
import {
  type AppStreamSubscriber,
  dispatchToUserSubscribers,
  fetchUserCatchUpNotifications,
  getLatestUserActivityId,
  orgChannel,
} from '#/modules/entities/app-stream';
import entityRoutes from '#/modules/entities/entities-routes';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import {
  dispatchToPublicSubscribers,
  fetchPublicDeleteCatchUp,
  getLatestPublicActivityId,
  type PublicStreamSubscriber,
  publicChannel,
} from '#/modules/entities/public-stream';
import { type ActivityEventWithEntity, activityBus, allActionVerbs } from '#/sync/activity-bus';
import { keepAlive, streamSubscriberManager, writeChange, writeOffset } from '#/sync/stream';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// ActivityBus event registration for SSE streams
// Cache invalidation is handled separately in cache-invalidation.ts
// ============================================

// Public entity events - dispatched to unauthenticated public stream
for (const entityType of hierarchy.publicAccessTypes) {
  for (const action of allActionVerbs) {
    const eventType = `${entityType}.${action}` as const;
    activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
      try {
        await dispatchToPublicSubscribers(event);
      } catch (error) {
        logEvent('error', 'Failed to dispatch public entity event', { error, activityId: event.id });
      }
    });
  }
}

// Membership events - routed via user channel
for (const action of allActionVerbs) {
  const eventType = `membership.${action}` as const;
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch membership event', { error, activityId: event.id });
    }
  });
}

// Product entity events - dispatched to authenticated app stream
for (const entityType of appConfig.productEntityTypes) {
  for (const action of allActionVerbs) {
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

// Context entity events - no 'created' (handled via membership.created)
const contextActions = allActionVerbs.filter((a) => a !== 'created');

for (const entityType of appConfig.contextEntityTypes) {
  for (const action of contextActions) {
    const eventType = `${entityType}.${action}` as const;
    activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
      try {
        await dispatchToUserSubscribers(event);
      } catch (error) {
        logEvent('error', 'Failed to dispatch context entity event', { error, activityId: event.id });
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
   * Public stream for public entity changes (no auth required)
   */
  .openapi(entityRoutes.publicStream, async (ctx) => {
    const { offset, live } = ctx.req.valid('query');

    // Resolve cursor from offset parameter
    let cursor: string | null = null;
    if (offset === 'now') {
      cursor = await getLatestPublicActivityId();
    } else if (offset) {
      cursor = offset;
    }

    // Non-SSE request: return delete catch-up notifications as batch
    if (live !== 'sse') {
      const catchUpNotifications = await fetchPublicDeleteCatchUp(cursor);
      const lastNotification = catchUpNotifications.at(-1);

      // Always return a consistent cursor - use lastNotification.activityId, original cursor, or empty string
      const newCursor = lastNotification?.activityId ?? cursor ?? '';

      return ctx.json({
        notifications: catchUpNotifications.map((n) => n.notification),
        cursor: newCursor,
      });
    }

    // SSE streaming mode - live only, no catch-up (client catches up first)
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
   * App stream (authenticated App stream for membership and entity updates)
   */
  .openapi(entityRoutes.appStream, async (ctx) => {
    const { offset, live } = ctx.req.valid('query');
    const user = ctx.var.user;
    const memberships = ctx.var.memberships;
    const userSystemRole = ctx.var.userSystemRole;
    const sessionToken = ctx.var.sessionToken;
    const orgIds = new Set(memberships.map((m) => m.organizationId));

    // Resolve cursor from offset parameter
    let cursor: string | null = null;
    if (offset === 'now') {
      cursor = await getLatestUserActivityId(user.id, orgIds);
    } else if (offset) {
      cursor = offset;
    }

    // Non-streaming catch-up request
    if (live !== 'sse') {
      const catchUpNotifications = await fetchUserCatchUpNotifications(user.id, orgIds, cursor);
      const lastNotification = catchUpNotifications.at(-1);

      // Sign cache tokens for this user's session
      const signedNotifications = catchUpNotifications.map((a) => ({
        ...a.notification,
        cacheToken: a.notification.cacheToken ? signCacheToken(a.notification.cacheToken, sessionToken) : null,
      }));

      return ctx.json({
        notifications: signedNotifications,
        cursor: lastNotification?.activityId ?? cursor,
      });
    }

    // SSE streaming mode
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send catch-up notifications with signed tokens
      const catchUpNotifications = await fetchUserCatchUpNotifications(user.id, orgIds, cursor);
      for (const { activityId, notification } of catchUpNotifications) {
        const signedNotification = notification.cacheToken
          ? { ...notification, cacheToken: signCacheToken(notification.cacheToken, sessionToken) }
          : notification;
        await writeChange(stream, activityId, signedNotification);
        cursor = activityId;
      }

      // Send offset marker (catch-up complete)
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
  });

export default entitiesRouteHandlers;
