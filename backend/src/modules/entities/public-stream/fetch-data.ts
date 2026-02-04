/**
 * Data fetching utilities for public stream catch-up.
 * Entity-agnostic: uses config.publicProductEntityTypes dynamically.
 */

import { and, desc, gt, inArray } from 'drizzle-orm';
import { appConfig, type PublicProductEntityType } from 'shared';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';

/**
 * Public stream catch-up activity format.
 */
export interface PublicCatchUpActivity {
  activityId: string;
  action: 'create' | 'update' | 'delete';
  entityType: PublicProductEntityType;
  entityId: string;
  changedKeys: string[] | null;
  createdAt: string;
}

/**
 * Fetch delete activities for public stream catch-up.
 * Only returns .deleted activities since the cursor for public entity types.
 */
export async function fetchPublicDeleteCatchUp(cursor: string | null, limit = 100): Promise<PublicCatchUpActivity[]> {
  const publicTypes = appConfig.publicProductEntityTypes as readonly string[];

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
      action: 'delete' as const,
      entityType: a.entityType as PublicProductEntityType,
      entityId: a.entityId!,
      changedKeys: null,
      createdAt: a.createdAt,
    }));
}

/**
 * Get latest public entity activity ID (for 'now' offset).
 */
export async function getLatestPublicActivityId(): Promise<string | null> {
  const publicTypes = [...appConfig.publicProductEntityTypes];

  if (publicTypes.length === 0) return null;

  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(inArray(activitiesTable.entityType, publicTypes))
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  return result[0]?.id ?? null;
}
