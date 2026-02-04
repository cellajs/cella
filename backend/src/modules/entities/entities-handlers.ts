import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { type Env, getContextMemberships, getContextUser, getContextUserSystemRole } from '#/lib/context';
import { publicEntityCache } from '#/middlewares/entity-cache';
import {
  type AppStreamSubscriber,
  dispatchToUserSubscribers,
  fetchUserCatchUpActivities,
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
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { keepAlive, streamSubscriberManager, writeChange, writeOffset } from '#/sync/stream';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// ActivityBus registration for public entity stream
// ============================================

// Register listeners dynamically for all public product entity types
for (const entityType of appConfig.publicProductEntityTypes) {
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

// Product entity events - routed via org channel to App stream subscribers
// TODO not entityConfig agnostic yet
const productEntityEvents = [
  'page.created',
  'page.updated',
  'page.deleted',
  'attachment.created',
  'attachment.updated',
  'attachment.deleted',
] as const;

for (const eventType of productEntityEvents) {
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch product entity event', { error, activityId: event.id });
    }
  });
}

// Organization events - routed via org channel
// TODO not entityConfig agnostic yet or is this one ok?

const organizationEvents = ['organization.updated', 'organization.deleted'] as const;

for (const eventType of organizationEvents) {
  activityBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await dispatchToUserSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to dispatch organization event', { error, activityId: event.id });
    }
  });
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

    const slugAvailable = await checkSlugAvailable(slug, entityType);

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

    // Non-SSE request: return delete catch-up activities as batch
    if (live !== 'sse') {
      const deleteActivities = await fetchPublicDeleteCatchUp(cursor);
      const lastActivity = deleteActivities.at(-1);

      // Always return a consistent cursor - use lastActivity.activityId, original cursor, or empty string
      const newCursor = lastActivity?.activityId ?? cursor ?? '';

      return ctx.json({
        activities: deleteActivities.map((a) => ({
          activityId: a.activityId,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          changedKeys: a.changedKeys,
          createdAt: a.createdAt,
        })),
        cursor: newCursor,
      });
    }

    // SSE streaming mode - live only, no catch-up (client polls first)
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send offset marker immediately (live mode ready)
      await writeOffset(stream, cursor);

      // Register subscriber on all public entity channels
      const channels = appConfig.publicProductEntityTypes.map((t) => publicChannel(t));
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
    });
  })
  /**
   * App stream (authenticated App stream for membership and entity updates)
   */
  .openapi(entityRoutes.appStream, async (ctx) => {
    const { offset, live } = ctx.req.valid('query');
    const user = getContextUser();
    const memberships = getContextMemberships();
    const userSystemRole = getContextUserSystemRole();
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
      const catchUpActivities = await fetchUserCatchUpActivities(user.id, orgIds, cursor);
      const lastActivity = catchUpActivities.at(-1);

      return ctx.json({
        activities: catchUpActivities.map((a) => a.notification),
        cursor: lastActivity?.activityId ?? cursor,
      });
    }

    // SSE streaming mode
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send catch-up activities
      const catchUpActivities = await fetchUserCatchUpActivities(user.id, orgIds, cursor);
      for (const { activityId, notification } of catchUpActivities) {
        await writeChange(stream, activityId, notification);
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
    });
  });

export default entitiesRouteHandlers;
