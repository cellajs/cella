/**
 * Data fetching utilities for public stream catch-up.
 * Entity-agnostic: uses hierarchy.publicAccessTypes dynamically.
 */

import { and, desc, gt, inArray, sql } from 'drizzle-orm';
import { hierarchy } from 'shared';
import { baseDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { contextCountersTable } from '#/db/schema/context-counters';
import type { PublicCatchupResponse } from '#/schemas';

/** Prefix for public (org-less) entity seq keys in contextCountersTable — must match CDC */
const PUBLIC_SEQ_PREFIX = 'public';

/**
 * Fetch catchup summary for the public stream.
 *
 * Uses contextCountersTable for O(1) seq lookup instead of scanning activities.
 * Public entity types use 'public:{entityType}' as entityId.
 * When clientSeqs are provided and all match, returns immediately
 * (no activities query at all — the common reconnect case).
 */
export async function fetchPublicCatchupSummary(
  cursor: string | null,
  clientSeqs?: Record<string, number>,
): Promise<PublicCatchupResponse> {
  const publicTypes = [...hierarchy.publicAccessTypes];

  if (publicTypes.length === 0) return { changes: {}, cursor };

  // Map entityType → contextCounters entityId (e.g. 'page' → 'public:page')
  const publicEntityIds = publicTypes.map((t) => `${PUBLIC_SEQ_PREFIX}:${t}`);

  // Step 1: Get current seqs from contextCountersTable (fast PK lookup)
  const seqRows = await db
    .select({ contextKey: contextCountersTable.contextKey, value: contextCountersTable.seq })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, publicEntityIds));

  const serverSeqs = new Map(seqRows.map((r) => [r.contextKey.replace(`${PUBLIC_SEQ_PREFIX}:`, ''), r.value]));

  // Step 2: Build changes for scopes with seq gaps (or all scopes if no clientSeqs)
  const changes: PublicCatchupResponse['changes'] = {};
  const changedScopes: string[] = [];

  for (const entityType of publicTypes) {
    const serverSeq = serverSeqs.get(entityType) ?? 0;
    const clientSeq = clientSeqs?.[entityType] ?? 0;

    if (!clientSeqs || serverSeq !== clientSeq) {
      changes[entityType] = { seq: serverSeq, deletedIds: [] };
      if (serverSeq !== clientSeq) changedScopes.push(entityType);
    }
  }

  // Fast path: all seqs match → nothing changed, return immediately
  if (changedScopes.length === 0 && clientSeqs && cursor) {
    return { changes: {}, cursor };
  }

  // Step 3: Query deletes only for changed scopes (if cursor exists)
  if (cursor && changedScopes.length > 0) {
    // Cast to enum values for Drizzle type compatibility
    const changedTypes = changedScopes as (typeof activitiesTable.entityType.enumValues)[number][];

    const deletedResults = await db
      .select({ entityType: activitiesTable.entityType, entityId: activitiesTable.entityId })
      .from(activitiesTable)
      .where(
        and(
          inArray(activitiesTable.entityType, changedTypes),
          sql`${activitiesTable.action} = 'delete'`,
          gt(activitiesTable.id, cursor),
        ),
      )
      .limit(1000);

    for (const row of deletedResults) {
      if (row.entityType && row.entityId && changes[row.entityType]) {
        changes[row.entityType].deletedIds.push(row.entityId);
      }
    }
  }

  // Step 4: Advance cursor (skip query if nothing changed)
  let newCursor = cursor;
  if (!cursor || changedScopes.length > 0) {
    newCursor = (await getLatestPublicActivityId()) ?? cursor;
  }

  return { changes, cursor: newCursor };
}

/**
 * Get latest public entity activity ID (for 'now' offset and as cursor).
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
