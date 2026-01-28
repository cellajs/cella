import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { type ContextEntityType, isRealtimeEntity } from 'config';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { generateCacheToken } from '#/lib/cache-token';
import type { StreamNotification } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import type { BuildNotificationOptions } from '#/sync/stream';

/**
 * Build stream notification from activity event.
 * Notification-only format - no entity data included.
 *
 * For realtime entities:
 * - Includes tx, seq, cacheToken for sync engine
 * - Client uses cacheToken to fetch entity via LRU cache
 *
 * For membership:
 * - tx/seq/cacheToken are null
 * - Client invalidates queries to refetch
 */
export function buildStreamNotification(
  event: ActivityEventWithEntity,
  options: BuildNotificationOptions = {},
): StreamNotification {
  const { entityType } = event;
  const isRealtime = isRealtimeEntity(entityType);

  // Generate cache token for product entities if user context is available
  let cacheToken: string | null = null;
  if (isRealtimeEntity(entityType) && options.userId && options.organizationIds && event.tx) {
    cacheToken = generateCacheToken(
      options.userId,
      options.organizationIds,
      entityType,
      event.entityId!,
      event.tx.version,
    );
  }

  // Extract contextType for membership events
  const contextType: ContextEntityType | null =
    event.resourceType === 'membership' ? ((event.entity?.contextType as ContextEntityType | undefined) ?? null) : null;

  return {
    action: event.action,
    entityType: event.entityType,
    resourceType: event.resourceType,
    entityId: event.entityId!,
    organizationId: event.organizationId,
    contextType,
    seq: isRealtime ? (event.seq ?? 0) : null,
    tx:
      isRealtime && event.tx
        ? {
            id: event.tx.id,
            sourceId: event.tx.sourceId,
            version: event.tx.version,
            fieldVersions: event.tx.fieldVersions,
          }
        : null,
    cacheToken,
  };
}

/**
 * Catch-up activity with activity ID for cursor tracking.
 */
export interface CatchUpActivity {
  activityId: string;
  notification: StreamNotification;
}

/**
 * Fetch catch-up activities for a user.
 * Returns membership and organization events for orgs the user belongs to.
 */
export async function fetchUserCatchUpActivities(
  _userId: string,
  orgIds: Set<string>,
  cursor: string | null,
  limit = 50,
): Promise<CatchUpActivity[]> {
  if (orgIds.size === 0) return [];

  const orgIdArray = Array.from(orgIds);

  // Build conditions
  const conditions = [
    or(
      // Membership events where the user is the subject
      and(eq(activitiesTable.resourceType, 'membership'), inArray(activitiesTable.organizationId, orgIdArray)),
      // Organization update/delete events for user's orgs
      and(eq(activitiesTable.entityType, 'organization'), inArray(activitiesTable.entityId, orgIdArray)),
    ),
  ];

  if (cursor) {
    conditions.push(gt(activitiesTable.id, cursor));
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(limit);

  // Build catch-up activities with notifications
  const catchUpActivities: CatchUpActivity[] = [];

  for (const activity of activities) {
    const notification: StreamNotification = {
      action: activity.action,
      entityType: activity.entityType,
      resourceType: activity.resourceType,
      entityId: activity.entityId!,
      organizationId: activity.organizationId,
      contextType: null, // Not available in catch-up (would require joining membership table)
      seq: null,
      tx: null,
      cacheToken: null,
    };

    catchUpActivities.push({
      activityId: activity.id,
      notification,
    });
  }

  return catchUpActivities;
}

/**
 * Get the latest activity ID relevant to a user.
 */
export async function getLatestUserActivityId(_userId: string, orgIds: Set<string>): Promise<string | null> {
  if (orgIds.size === 0) return null;

  const orgIdArray = Array.from(orgIds);

  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      or(
        and(eq(activitiesTable.resourceType, 'membership'), inArray(activitiesTable.organizationId, orgIdArray)),
        and(eq(activitiesTable.entityType, 'organization'), inArray(activitiesTable.entityId, orgIdArray)),
      ),
    )
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  return result[0]?.id ?? null;
}
