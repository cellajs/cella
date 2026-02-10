import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { appConfig, type ContextEntityType, isProductEntity } from 'shared';
import { unsafeInternalDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import type { StreamNotification } from '#/schemas';
import { type ActivityEventWithEntity, getTypedEntity } from '#/sync/activity-bus';

/**
 * Build stream notification from activity event.
 * Notification-only format - no entity data included.
 *
 * For realtime entities:
 * - Includes stx, seq, cacheToken for sync engine
 * - Client uses cacheToken to fetch entity via entity cache
 *
 * For membership:
 * - stx/seq/cacheToken are null
 * - Client invalidates queries to refetch
 */
export function buildStreamNotification(event: ActivityEventWithEntity): StreamNotification {
  const { entityType } = event;
  const isProduct = isProductEntity(entityType);

  // Use cache token from CDC (all users share the same token)
  const cacheToken = isProduct ? (event.cacheToken ?? null) : null;

  // Extract contextType for membership events
  const membership = event.resourceType === 'membership' ? getTypedEntity(event, 'membership') : null;
  const contextType: ContextEntityType | null = (membership?.contextType as ContextEntityType | undefined) ?? null;

  return {
    action: event.action,
    entityType: isProduct ? entityType : null,
    resourceType: event.resourceType,
    entityId: event.entityId!,
    organizationId: event.organizationId,
    contextType,
    seq: isProduct ? (event.seq ?? 0) : null,
    stx:
      isProduct && event.stx
        ? {
            id: event.stx.id,
            sourceId: event.stx.sourceId,
            version: event.stx.version,
            fieldVersions: event.stx.fieldVersions,
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
 * Returns activities for all synced entity types in user's orgs.
 * Entity-agnostic: uses appConfig.productEntityTypes and appConfig.contextEntityTypes.
 */
export async function fetchUserCatchUpActivities(
  _userId: string,
  orgIds: Set<string>,
  cursor: string | null,
  limit = 50,
): Promise<CatchUpActivity[]> {
  if (orgIds.size === 0) return [];

  const orgIdArray = Array.from(orgIds);

  // Combine all synced entity types (product + context entities)
  const syncedEntityTypes = [...appConfig.productEntityTypes, ...appConfig.contextEntityTypes];

  // Build conditions: all synced entities in user's orgs + membership events
  const conditions = [
    or(
      // Membership events for user's orgs
      and(eq(activitiesTable.resourceType, 'membership'), inArray(activitiesTable.organizationId, orgIdArray)),
      // All synced entity types in user's orgs
      and(inArray(activitiesTable.entityType, syncedEntityTypes), inArray(activitiesTable.organizationId, orgIdArray)),
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
      entityType: isProductEntity(activity.entityType) ? activity.entityType : null,
      resourceType: activity.resourceType,
      entityId: activity.entityId!,
      organizationId: activity.organizationId,
      contextType: null, // Not available in catch-up (would require joining membership table)
      seq: null,
      stx: null,
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
 * Entity-agnostic: uses appConfig.productEntityTypes and appConfig.contextEntityTypes.
 */
export async function getLatestUserActivityId(_userId: string, orgIds: Set<string>): Promise<string | null> {
  if (orgIds.size === 0) return null;

  const orgIdArray = Array.from(orgIds);
  const syncedEntityTypes = [...appConfig.productEntityTypes, ...appConfig.contextEntityTypes];

  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      or(
        and(eq(activitiesTable.resourceType, 'membership'), inArray(activitiesTable.organizationId, orgIdArray)),
        and(
          inArray(activitiesTable.entityType, syncedEntityTypes),
          inArray(activitiesTable.organizationId, orgIdArray),
        ),
      ),
    )
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  return result[0]?.id ?? null;
}
