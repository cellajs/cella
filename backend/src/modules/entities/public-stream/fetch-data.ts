/**
 * Data fetching utilities for public stream catch-up.
 * Entity-agnostic: uses hierarchy.publicAccessTypes dynamically.
 */

import { and, desc, gt, inArray } from 'drizzle-orm';
import { hierarchy, isProductEntity } from 'shared';
import { unsafeInternalDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import type { StreamNotification } from '#/schemas';

/**
 * Catch-up notification with activity ID for cursor tracking.
 */
export interface PublicCatchUpNotification {
  activityId: string;
  notification: StreamNotification;
}

/**
 * Fetch delete activities for public stream catch-up.
 * Only returns .deleted activities since the cursor for public entity types.
 */
export async function fetchPublicDeleteCatchUp(
  cursor: string | null,
  limit = 100,
): Promise<PublicCatchUpNotification[]> {
  const publicTypes = hierarchy.publicAccessTypes as readonly string[];

  if (publicTypes.length === 0) return [];

  // Build delete activity type patterns for all public entity types
  const deleteTypes = publicTypes.map((t) => `${t}.deleted`);

  const conditions = [inArray(activitiesTable.type, deleteTypes)];
  if (cursor) {
    conditions.push(gt(activitiesTable.id, cursor));
  }

  const activities = await db
    .select({
      id: activitiesTable.id,
      entityType: activitiesTable.entityType,
      entityId: activitiesTable.entityId,
      createdAt: activitiesTable.createdAt,
    })
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(activitiesTable.id) // Ascending order for forward cursor pagination
    .limit(limit);

  return activities
    .filter((a) => a.entityType && a.entityId)
    .map((a) => ({
      activityId: a.id,
      notification: {
        action: 'delete' as const,
        entityType: isProductEntity(a.entityType) ? a.entityType : null,
        resourceType: null,
        entityId: a.entityId!,
        organizationId: null,
        contextType: null,
        seq: null,
        stx: null,
        cacheToken: null,
      },
    }));
}

/**
 * Get latest public entity activity ID (for 'now' offset).
 */
export async function getLatestPublicActivityId(): Promise<string | null> {
  const publicTypes = [...hierarchy.publicAccessTypes];

  if (publicTypes.length === 0) return null;

  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(inArray(activitiesTable.entityType, publicTypes))
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  return result[0]?.id ?? null;
}
