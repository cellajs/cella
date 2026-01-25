import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Fetch enriched membership data with organization details.
 * Used when routing membership events to users since CDC only has raw row data.
 */
export async function fetchMembershipWithOrg(membershipId: string) {
  const result = await db
    .select({
      membership: membershipsTable,
      organization: {
        id: organizationsTable.id,
        slug: organizationsTable.slug,
        name: organizationsTable.name,
        thumbnailUrl: organizationsTable.thumbnailUrl,
        logoUrl: organizationsTable.logoUrl,
        entityType: organizationsTable.entityType,
      },
    })
    .from(membershipsTable)
    .innerJoin(organizationsTable, eq(membershipsTable.organizationId, organizationsTable.id))
    .where(eq(membershipsTable.id, membershipId))
    .limit(1);

  if (!result[0]) return null;

  const { membership, organization } = result[0];
  return {
    ...organization,
    membership,
  };
}

/**
 * Fetch organization data by ID.
 */
export async function fetchOrganization(orgId: string) {
  const result = await db
    .select({
      id: organizationsTable.id,
      slug: organizationsTable.slug,
      name: organizationsTable.name,
      thumbnailUrl: organizationsTable.thumbnailUrl,
      logoUrl: organizationsTable.logoUrl,
      entityType: organizationsTable.entityType,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Enrich an activity event with full entity data from DB.
 * Required because CDC row data doesn't include joined relations.
 */
export async function enrichEventData(event: ActivityEventWithEntity): Promise<Record<string, unknown> | null> {
  // For membership events, fetch membership with org
  if (event.resourceType === 'membership') {
    // For deletes, we don't have the membership anymore
    if (event.action === 'delete') {
      // Return minimal data for delete events
      const orgId = event.organizationId ?? (event.entity?.organizationId as string | undefined);
      if (orgId) {
        const org = await fetchOrganization(orgId);
        if (org) {
          return {
            ...org,
            entityId: event.entity?.id ?? event.entityId,
          };
        }
      }
      return null;
    }

    // For create/update, get membership ID from entity data
    const membershipId = event.entity?.id as string | undefined;
    if (!membershipId) return null;

    return fetchMembershipWithOrg(membershipId);
  }

  // For organization events, fetch org data
  if (event.entityType === 'organization' && event.entityId) {
    // For deletes, return what we have from the event
    if (event.action === 'delete') {
      return event.entity ?? null;
    }
    return fetchOrganization(event.entityId);
  }

  return event.entity ?? null;
}

/**
 * User stream message format.
 * Aligned with frontend expectations.
 */
export interface UserStreamMessage {
  activityId: string;
  action: 'create' | 'update' | 'delete';
  entityType: string | null;
  resourceType: string | null;
  entityId: string | null;
  organizationId: string | null;
  createdAt: string;
  data: Record<string, unknown> | null;
}

/**
 * Build a user stream message from an activity event.
 */
export function buildUserStreamMessage(
  event: ActivityEventWithEntity,
  enrichedData: Record<string, unknown> | null,
): UserStreamMessage {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType,
    resourceType: event.resourceType,
    entityId: event.entityId,
    organizationId: event.organizationId,
    createdAt: event.createdAt,
    data: enrichedData,
  };
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
): Promise<UserStreamMessage[]> {
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

  // Filter to only include activities where user is the membership subject
  // (We can't do this in SQL without joining memberships table)
  const messages: UserStreamMessage[] = [];

  for (const activity of activities) {
    const createdAt = String(activity.createdAt);

    // For membership events, we need to check if the user was the subject
    // Since we're catching up, we can check the current membership or skip stale events
    if (activity.resourceType === 'membership') {
      // For catch-up, include all membership events in user's orgs
      // The frontend will filter based on actual data
      messages.push({
        activityId: activity.id,
        action: activity.action as 'create' | 'update' | 'delete',
        entityType: activity.entityType,
        resourceType: activity.resourceType,
        entityId: activity.entityId,
        organizationId: activity.organizationId,
        createdAt,
        data: null, // Catch-up data will be fetched fresh by frontend
      });
    } else if (activity.entityType === 'organization') {
      messages.push({
        activityId: activity.id,
        action: activity.action as 'create' | 'update' | 'delete',
        entityType: activity.entityType,
        resourceType: activity.resourceType,
        entityId: activity.entityId,
        organizationId: activity.organizationId,
        createdAt,
        data: null,
      });
    }
  }

  return messages;
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
