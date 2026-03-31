import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { contextCountersTable } from '#/db/schema/context-counters';
import type { AppCatchupResponse, CatchupChangeSummary } from '#/schemas';
import { entityTables } from '#/table-config';

type PropagationTarget = { targetType: string; field: string };

const propagationTargets: Record<string, PropagationTarget[]> = {
  label: [{ targetType: 'task', field: 'labels' }],
};

/**
 * Fetch catchup summary for a user.
 *
 * Dual-level change detection:
 *   1. Org-level: O(1) entitySeqs check per org (quick screening)
 *   2. Project-level: for changed orgs, drill into project-scoped counters (precision)
 *
 * Entity seqs (from CDC worker) detect creates/updates.
 * Deletes and membership changes are always scanned from the activities table (cursor-bounded, watertight).
 *
 * When cursor is null (fresh connect), baselines are returned and membership
 * queries are always invalidated on the client side.
 */
export async function fetchUserCatchupSummary(
  userId: string,
  organizationIds: Set<string>,
  cursor: string | null,
  clientSeqs?: Record<string, number>,
  projectIdsByOrg?: Map<string, Set<string>>,
): Promise<AppCatchupResponse> {
  if (organizationIds.size === 0) return { changes: {}, cursor };

  const organizationIdArray = Array.from(organizationIds);

  // Step 1: Get org-level counts from contextCountersTable (fast PK lookup)
  const counterRows = await db
    .select({
      contextKey: contextCountersTable.contextKey,
      counts: contextCountersTable.counts,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, organizationIdArray));

  const serverCounters = new Map(counterRows.map((r) => [r.contextKey, { counts: r.counts }]));

  // Step 2: Build changes for scopes with entitySeq gaps (org-level screening)
  const changes: AppCatchupResponse['changes'] = {};
  const orgsWithChanges: string[] = [];

  for (const organizationId of organizationIdArray) {
    const server = serverCounters.get(organizationId) ?? { counts: {} };

    // Extract org-level seqs (s: prefix) and counts (e: prefix) from counts JSONB
    const entitySeqs: Record<string, number> = {};
    const entityCounts: Record<string, number> = {};
    if (server.counts) {
      for (const [key, value] of Object.entries(server.counts)) {
        if (typeof value !== 'number') continue;
        if (key.startsWith('s:')) entitySeqs[key.slice(2)] = value;
        else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
      }
    }

    // Check if any org-level seq changed
    const entitySeqChanged =
      !clientSeqs ||
      Object.entries(entitySeqs).some(([entityType, serverVal]) => {
        const clientVal = clientSeqs[`${organizationId}:s:${entityType}`] ?? 0;
        return serverVal !== clientVal;
      });

    if (entitySeqChanged) {
      changes[organizationId] = {
        deletedByType: {},
        entitySeqs: Object.keys(entitySeqs).length > 0 ? entitySeqs : undefined,
        entityCounts: Object.keys(entityCounts).length > 0 ? entityCounts : undefined,
      };
      orgsWithChanges.push(organizationId);
    }
  }

  // Step 2.5: Project-level drill-down for orgs with changes
  // Query project-scoped counters to provide per-project entitySeqs for precise delta fetch
  if (orgsWithChanges.length > 0 && projectIdsByOrg) {
    const projectIdsToQuery: string[] = [];
    for (const orgId of orgsWithChanges) {
      const projectIds = projectIdsByOrg.get(orgId);
      if (projectIds) {
        for (const pid of projectIds) projectIdsToQuery.push(pid);
      }
    }

    if (projectIdsToQuery.length > 0) {
      const projectCounterRows = await db
        .select({
          contextKey: contextCountersTable.contextKey,
          counts: contextCountersTable.counts,
        })
        .from(contextCountersTable)
        .where(inArray(contextCountersTable.contextKey, projectIdsToQuery));

      const projectCounters = new Map(projectCounterRows.map((r) => [r.contextKey, r.counts]));

      // Attach project-level data to each changed org's response
      for (const orgId of orgsWithChanges) {
        const projectIds = projectIdsByOrg.get(orgId);
        if (!projectIds) continue;

        const projectChanges: Record<
          string,
          { entitySeqs?: Record<string, number>; entityCounts?: Record<string, number> }
        > = {};

        for (const projectId of projectIds) {
          const counts = projectCounters.get(projectId);
          if (!counts) continue;

          const projEntitySeqs: Record<string, number> = {};
          const projEntityCounts: Record<string, number> = {};
          for (const [key, value] of Object.entries(counts)) {
            if (typeof value !== 'number') continue;
            if (key.startsWith('s:')) projEntitySeqs[key.slice(2)] = value;
            else if (key.startsWith('e:')) projEntityCounts[key.slice(2)] = value;
          }

          if (Object.keys(projEntitySeqs).length > 0 || Object.keys(projEntityCounts).length > 0) {
            projectChanges[projectId] = {
              entitySeqs: Object.keys(projEntitySeqs).length > 0 ? projEntitySeqs : undefined,
              entityCounts: Object.keys(projEntityCounts).length > 0 ? projEntityCounts : undefined,
            };
          }
        }

        if (Object.keys(projectChanges).length > 0) {
          changes[orgId].projectChanges = projectChanges;
        }
      }
    }
  }

  // Step 3: Scan activities for deletes AND membership changes (cursor-bounded, watertight)
  // Entity-type seqs only track creates/updates (CDC worker stamps on INSERT/UPDATE).
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
          inArray(activitiesTable.organizationId, organizationIdArray),
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
    const ensureChangesEntry = (organizationId: string) => {
      if (changes[organizationId]) return;
      const server = serverCounters.get(organizationId) ?? { counts: {} };
      const entitySeqs: Record<string, number> = {};
      const entityCounts: Record<string, number> = {};
      if (server.counts) {
        for (const [key, value] of Object.entries(server.counts)) {
          if (typeof value !== 'number') continue;
          if (key.startsWith('s:')) entitySeqs[key.slice(2)] = value;
          else if (key.startsWith('e:')) entityCounts[key.slice(2)] = value;
        }
      }
      changes[organizationId] = {
        deletedByType: {},
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

      // Product entity delete — entityType is guaranteed by the inArray filter above
      if (!row.entityId || !row.entityType) continue;
      ensureChangesEntry(row.organizationId);

      const scope = changes[row.organizationId];
      if (!scope.deletedByType[row.entityType]) scope.deletedByType[row.entityType] = [];
      scope.deletedByType[row.entityType].push(row.entityId);
    }
  }

  // Step 3.5: Build propagation hints for embedding relationships (e.g., label → task.labels).
  // Uses data already available: entitySeqs for detecting changed sources, deletedByType for removed sources.
  // Only queries source entity IDs that changed (lightweight ID-only SELECT, no GIN/joins).
  await buildPropagationHints(changes, clientSeqs);

  // Step 4: Advance cursor (skip query if nothing changed)
  let newCursor = cursor;
  if (!cursor || Object.keys(changes).length > 0) {
    newCursor = (await getLatestUserActivityId(userId, organizationIds)) ?? cursor;
  }

  return { changes, cursor: newCursor };
}

/**
 * Get the latest activity ID relevant to a user.
 * Used for 'now' offset and as new cursor in catchup responses.
 */
export async function getLatestUserActivityId(_userId: string, organizationIds: Set<string>): Promise<string | null> {
  if (organizationIds.size === 0) return null;

  const organizationIdArray = Array.from(organizationIds);

  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      or(
        and(
          eq(activitiesTable.resourceType, 'membership'),
          inArray(activitiesTable.organizationId, organizationIdArray),
        ),
        and(
          inArray(activitiesTable.entityType, [...appConfig.productEntityTypes, ...appConfig.contextEntityTypes]),
          inArray(activitiesTable.organizationId, organizationIdArray),
        ),
      ),
    )
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  return result[0]?.id ?? null;
}

/**
 * Build propagation hints for each org's change summary.
 * Checks propagationTargets config to find source entity types that changed,
 * then queries changed IDs (lightweight ID-only SELECT) and attaches hints.
 */
async function buildPropagationHints(
  changes: AppCatchupResponse['changes'],
  clientSeqs?: Record<string, number>,
): Promise<void> {
  const sourceTypes = Object.keys(propagationTargets);
  if (sourceTypes.length === 0) return;

  for (const [organizationId, scope] of Object.entries(changes)) {
    const hints: CatchupChangeSummary['propagation'] = [];

    for (const sourceType of sourceTypes) {
      const targets = propagationTargets[sourceType];
      if (!targets?.length) continue;

      const serverSeq = scope.entitySeqs?.[sourceType];
      const clientSeq = clientSeqs?.[`${organizationId}:s:${sourceType}`] ?? 0;
      const deletedIds = scope.deletedByType[sourceType] ?? [];
      const seqDelta = (serverSeq ?? 0) - clientSeq;

      // Skip if no changes and no deletes for this source type
      if (seqDelta <= 0 && deletedIds.length === 0) continue;

      // Fetch updated source IDs (creates/updates since client's last seq)
      let updatedIds: string[] = [];
      if (seqDelta > 0 && clientSeq > 0) {
        updatedIds = await fetchChangedEntityIds(sourceType, organizationId, clientSeq);
      }

      for (const target of targets) {
        if (updatedIds.length > 0 || deletedIds.length > 0) {
          hints.push({
            sourceType,
            targetType: target.targetType,
            field: target.field,
            update: updatedIds,
            remove: deletedIds,
          });
        }
      }
    }

    if (hints.length > 0) {
      scope.propagation = hints;
    }
  }
}

/**
 * Fetch IDs of entities that changed since a given seq.
 * Lightweight ID-only query — no GIN, no joins.
 */
async function fetchChangedEntityIds(entityType: string, organizationId: string, afterSeq: number): Promise<string[]> {
  const table = entityTables[entityType as keyof typeof entityTables];
  if (!table) return [];

  // All product entity tables have seq + organizationId columns (raw SQL needed — union type lacks common columns)
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(sql`seq > ${afterSeq} AND organization_id = ${organizationId}`);

  return rows.map((r) => r.id);
}
