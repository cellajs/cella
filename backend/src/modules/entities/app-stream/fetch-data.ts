import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { contextCountersTable } from '#/db/schema/context-counters';
import type { AppCatchupResponse } from '#/schemas';

/**
 * Fetch catchup summary for a user.
 *
 * Uses contextCountersTable for O(1) entitySeqs lookup per org.
 * contextEntity-scoped seqs (from stamp_entity_seq_at trigger) are the primary
 * mechanism for detecting creates/updates. Deletes and membership changes
 * are always scanned from the activities table (cursor-bounded, watertight).
 *
 * When cursor is null (fresh connect), baselines are returned and membership
 * queries are always invalidated on the client side.
 */
export async function fetchUserCatchupSummary(
  userId: string,
  orgIds: Set<string>,
  cursor: string | null,
  clientSeqs?: Record<string, number>,
): Promise<AppCatchupResponse> {
  if (orgIds.size === 0) return { changes: {}, cursor };

  const orgIdArray = Array.from(orgIds);

  // Step 1: Get counts from contextCountersTable (fast PK lookup)
  const counterRows = await db
    .select({
      contextKey: contextCountersTable.contextKey,
      counts: contextCountersTable.counts,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, orgIdArray));

  const serverCounters = new Map(counterRows.map((r) => [r.contextKey, { counts: r.counts }]));

  // Step 2: Build changes for scopes with entitySeq gaps
  const changes: AppCatchupResponse['changes'] = {};

  for (const orgId of orgIdArray) {
    const server = serverCounters.get(orgId) ?? { counts: {} };

    // Extract contextEntity-scoped seqs (s: prefix) and counts (e: prefix) from counts JSONB
    const entitySeqs: Record<string, number> = {};
    const entityCounts: Record<string, number> = {};
    if (server.counts) {
      for (const [key, value] of Object.entries(server.counts)) {
        if (typeof value !== 'number') continue;
        if (key.startsWith('s:')) entitySeqs[key.slice(2)] = value;
        else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
      }
    }

    // Check if any contextEntity-scoped seq changed
    const entitySeqChanged =
      !clientSeqs ||
      Object.entries(entitySeqs).some(([entityType, serverVal]) => {
        const clientVal = clientSeqs[`${orgId}:s:${entityType}`] ?? 0;
        return serverVal !== clientVal;
      });

    if (entitySeqChanged) {
      changes[orgId] = {
        deletedIds: [],
        entitySeqs: Object.keys(entitySeqs).length > 0 ? entitySeqs : undefined,
        entityCounts: Object.keys(entityCounts).length > 0 ? entityCounts : undefined,
      };
    }
  }

  // Step 3: Scan activities for deletes AND membership changes (cursor-bounded, watertight)
  // Entity-type seqs only track creates/updates (trigger fires on INSERT/UPDATE).
  // Delete and membership change detection relies entirely on the activities table scan.
  if (cursor) {
    const activityResults = await db
      .select({
        organizationId: activitiesTable.organizationId,
        entityId: activitiesTable.entityId,
        entityType: activitiesTable.entityType,
        resourceType: activitiesTable.resourceType,
      })
      .from(activitiesTable)
      .where(
        and(
          gt(activitiesTable.id, cursor),
          inArray(activitiesTable.organizationId, orgIdArray),
          or(
            // Product entity deletes
            and(
              inArray(activitiesTable.entityType, [...appConfig.productEntityTypes]),
              sql`${activitiesTable.action} = 'delete'`,
            ),
            // Any membership activity (create/update/delete)
            eq(activitiesTable.resourceType, 'membership'),
          ),
        ),
      )
      .limit(1000);

    // Helper to ensure a changes entry exists for an org
    const ensureChangesEntry = (orgId: string) => {
      if (changes[orgId]) return;
      const server = serverCounters.get(orgId) ?? { counts: {} };
      const entitySeqs: Record<string, number> = {};
      const entityCounts: Record<string, number> = {};
      if (server.counts) {
        for (const [key, value] of Object.entries(server.counts)) {
          if (typeof value !== 'number') continue;
          if (key.startsWith('s:')) entitySeqs[key.slice(2)] = value;
          else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
        }
      }
      changes[orgId] = {
        deletedIds: [],
        entitySeqs: Object.keys(entitySeqs).length > 0 ? entitySeqs : undefined,
        entityCounts: Object.keys(entityCounts).length > 0 ? entityCounts : undefined,
      };
    };

    for (const row of activityResults) {
      if (!row.organizationId) continue;

      // Membership activity — just ensure the org has a changes entry
      // (client always invalidates membership queries on catchup)
      if (row.resourceType === 'membership') {
        ensureChangesEntry(row.organizationId);
        continue;
      }

      // Product entity delete
      if (!row.entityId) continue;
      ensureChangesEntry(row.organizationId);

      changes[row.organizationId].deletedIds.push(row.entityId);

      // Group deletes by entityType for granular cache removal
      if (row.entityType) {
        const scope = changes[row.organizationId];
        if (!scope.deletedByType) scope.deletedByType = {};
        if (!scope.deletedByType[row.entityType]) scope.deletedByType[row.entityType] = [];
        scope.deletedByType[row.entityType].push(row.entityId);
      }
    }
  }

  // Step 4: Advance cursor (skip query if nothing changed)
  let newCursor = cursor;
  if (!cursor || Object.keys(changes).length > 0) {
    newCursor = (await getLatestUserActivityId(userId, orgIds)) ?? cursor;
  }

  return { changes, cursor: newCursor };
}

/**
 * Get the latest activity ID relevant to a user.
 * Used for 'now' offset and as new cursor in catchup responses.
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
        and(
          inArray(activitiesTable.entityType, [...appConfig.productEntityTypes, ...appConfig.contextEntityTypes]),
          inArray(activitiesTable.organizationId, orgIdArray),
        ),
      ),
    )
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  return result[0]?.id ?? null;
}
