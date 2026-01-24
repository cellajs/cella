import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig, type RealtimeEntityType } from 'config';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import type { TxColumnData } from '#/db/utils/product-entity-columns';
import {
  type Env,
  getContextMemberships,
  getContextOrganization,
  getContextUser,
  getContextUserSystemRole,
} from '#/lib/context';
import entityRoutes from '#/modules/entities/entities-routes';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { type OrgStreamSubscriber, orgIndexKey, routeToOrgSubscribers } from '#/modules/entities/stream';
import type { StreamMessage } from '#/schemas';
import { type ActivityAction, type ActivityEventWithEntity, activityActions, eventBus } from '#/sync/activity-bus';
import { keepAlive, streamSubscriberManager, writeChange, writeOffset } from '#/sync/stream';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// Catch-up helpers
// ============================================

/**
 * Type guard to check if a string is a valid RealtimeEntityType.
 */
function isRealtimeEntityType(value: string | null): value is RealtimeEntityType {
  return value !== null && appConfig.realtimeEntityTypes.includes(value as RealtimeEntityType);
}

/**
 * Type guard to check if a string is a valid ActivityAction.
 */
function isActivityAction(value: string | null): value is ActivityAction {
  return value !== null && activityActions.includes(value as ActivityAction);
}

/**
 * Convert activity to stream message format.
 */
function toStreamMessage(
  activity: {
    id: string;
    entityType: string | null;
    entityId: string | null;
    action: string | null;
    changedKeys: string[] | null;
    createdAt: Date | string;
    tx: TxColumnData | null;
  },
  entityData: unknown = null,
): StreamMessage | null {
  if (!isRealtimeEntityType(activity.entityType) || !isActivityAction(activity.action) || !activity.entityId) {
    return null;
  }

  const createdAtStr = typeof activity.createdAt === 'string' ? activity.createdAt : activity.createdAt.toISOString();

  return {
    activityId: activity.id,
    entityType: activity.entityType,
    entityId: activity.entityId,
    action: activity.action,
    changedKeys: activity.changedKeys ?? null,
    createdAt: createdAtStr,
    tx: activity.tx
      ? {
          transactionId: activity.tx.transactionId,
          sourceId: activity.tx.sourceId,
          changedField: activity.tx.changedField,
        }
      : null,
    data: entityData,
  };
}

/**
 * Fetch catch-up activities for an organization.
 */
async function fetchCatchUpActivities(
  orgId: string,
  cursor: string | null,
  entityTypes: RealtimeEntityType[],
  limit = 100,
): Promise<StreamMessage[]> {
  const conditions = [eq(activitiesTable.organizationId, orgId)];

  if (cursor) {
    conditions.push(gt(activitiesTable.id, cursor));
  }

  if (entityTypes.length > 0) {
    conditions.push(inArray(activitiesTable.entityType, entityTypes));
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(limit);

  return activities.map((activity) => toStreamMessage(activity)).filter((msg): msg is StreamMessage => msg !== null);
}

/**
 * Get the latest activity ID for cursor initialization.
 */
async function getLatestActivityId(orgId: string): Promise<string | null> {
  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(eq(activitiesTable.organizationId, orgId))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  return result[0]?.id ?? null;
}

// ============================================
// ActivityBus registration
// ============================================

const realtimeEvents = [
  'page.created',
  'page.updated',
  'page.deleted',
  'attachment.created',
  'attachment.updated',
  'attachment.deleted',
] as const;

for (const eventType of realtimeEvents) {
  eventBus.on(eventType, async (event: ActivityEventWithEntity) => {
    try {
      await routeToOrgSubscribers(event);
    } catch (error) {
      logEvent('error', 'Failed to route activity to stream subscribers', {
        error,
        activityId: event.id,
      });
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
   * Organization sync stream handler
   */
  .openapi(entityRoutes.stream, async (ctx) => {
    const { offset, live, entityTypes: entityTypesParam } = ctx.req.valid('query');
    const user = getContextUser();
    const organization = getContextOrganization();
    const orgId = organization.id;

    // Parse entity types filter
    const entityTypes: RealtimeEntityType[] = entityTypesParam
      ? (entityTypesParam.split(',').filter(Boolean) as RealtimeEntityType[])
      : [];

    // Resolve cursor from offset parameter
    let cursor: string | null = null;
    if (offset === 'now') {
      cursor = await getLatestActivityId(orgId);
    } else if (offset === '-1') {
      cursor = null;
    } else if (offset) {
      cursor = offset;
    }

    // Non-streaming catch-up request
    if (live !== 'sse') {
      const activities = await fetchCatchUpActivities(orgId, cursor, entityTypes);
      const lastActivity = activities.at(-1);

      return ctx.json({
        activities,
        cursor: lastActivity?.activityId ?? cursor,
      });
    }

    // SSE streaming mode
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send catch-up activities
      const catchUpActivities = await fetchCatchUpActivities(orgId, cursor, entityTypes);
      for (const activity of catchUpActivities) {
        await writeChange(stream, activity.activityId, activity);
        cursor = activity.activityId;
      }

      // Send offset marker (catch-up complete)
      await writeOffset(stream, cursor);

      // Build subscriber with all context for filtering
      const subscriber: OrgStreamSubscriber = {
        id: nanoid(),
        indexKey: orgIndexKey(orgId),
        stream,
        userId: user.id,
        orgId,
        userSystemRole: getContextUserSystemRole(),
        memberships: getContextMemberships(),
        cursor,
        entityTypes,
      };

      streamSubscriberManager.register(subscriber);
      logEvent('info', 'Stream subscriber registered', { subscriberId: subscriber.id, userId: user.id, orgId });

      // Handle disconnect
      stream.onAbort(() => {
        streamSubscriberManager.unregister(subscriber.id);
        logEvent('info', 'Stream subscriber disconnected', { subscriberId: subscriber.id, userId: user.id, orgId });
      });

      // Keep connection alive
      await keepAlive(stream);
    });
  });

export default entitiesRouteHandlers;
