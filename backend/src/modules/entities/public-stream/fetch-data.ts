/**
 * Data fetching utilities for public stream catch-up.
 * Entity-agnostic: uses hierarchy.publicActionsTypes dynamically.
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
 * Uses unscoped seqs from context_counters.counts['s:{entityType}']
 * (managed by stamp_entity_seq_at trigger) for change detection.
 * Deletes are always scanned from activities (cursor-bounded, watertight).
 *
 * When clientSeqs are provided and all match, returns immediately
 * (no activities query at all — the common reconnect case).
 */
export async function fetchPublicCatchupSummary(
  cursor: string | null,
  clientSeqs?: Record<string, number>,
): Promise<PublicCatchupResponse> {
  const publicTypes = [...hierarchy.publicActionsTypes];

  if (publicTypes.length === 0) return { changes: {}, cursor };

  // Map entityType → contextCounters contextKey (e.g. 'page' → 'public:page')
  const publicEntityIds = publicTypes.map((t) => `${PUBLIC_SEQ_PREFIX}:${t}`);

  // Step 1: Get current counts from contextCountersTable (fast PK lookup)
  const counterRows = await db
    .select({ contextKey: contextCountersTable.contextKey, counts: contextCountersTable.counts })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, publicEntityIds));

  // Extract unscoped seq from counts JSONB (s:{entityType} key)
  const serverSeqs = new Map<string, number>();
  for (const row of counterRows) {
    const entityType = row.contextKey.replace(`${PUBLIC_SEQ_PREFIX}:`, '');
    const seqKey = `s:${entityType}`;
    const seqVal =
      row.counts && typeof row.counts === 'object' ? (row.counts as Record<string, number>)[seqKey] : undefined;
    serverSeqs.set(entityType, typeof seqVal === 'number' ? seqVal : 0);
  }

  // Step 2: Build changes for scopes with seq gaps (or all scopes if no clientSeqs)
  const changes: PublicCatchupResponse['changes'] = {};

  for (const entityType of publicTypes) {
    const serverSeq = serverSeqs.get(entityType) ?? 0;
    const clientSeq = clientSeqs?.[entityType] ?? 0;

    if (!clientSeqs || serverSeq !== clientSeq) {
      changes[entityType] = {
        deletedIds: [],
        entitySeqs: { [entityType]: serverSeq },
      };
    }
  }

  // Fast path: all seqs match → check for deletes only
  const hasSeqChanges = Object.keys(changes).length > 0;

  // Step 3: Always scan for deletes (cursor-bounded, watertight)
  if (cursor) {
    const deletedResults = await db
      .select({ entityType: activitiesTable.entityType, entityId: activitiesTable.entityId })
      .from(activitiesTable)
      .where(
        and(
          inArray(activitiesTable.entityType, publicTypes as (typeof activitiesTable.entityType.enumValues)[number][]),
          sql`${activitiesTable.action} = 'delete'`,
          gt(activitiesTable.id, cursor),
        ),
      )
      .limit(1000);

    for (const row of deletedResults) {
      if (!row.entityType || !row.entityId) continue;

      // Ensure entityType has a changes entry (may not have one if only deletes happened)
      if (!changes[row.entityType]) {
        const serverSeq = serverSeqs.get(row.entityType) ?? 0;
        changes[row.entityType] = {
          deletedIds: [],
          entitySeqs: { [row.entityType]: serverSeq },
        };
      }

      changes[row.entityType].deletedIds.push(row.entityId);
    }
  }

  // Fast path: nothing changed at all → return empty
  if (!hasSeqChanges && Object.values(changes).every((c) => c.deletedIds.length === 0)) {
    if (clientSeqs && cursor) return { changes: {}, cursor };
  }

  // Step 4: Advance cursor (skip query if nothing changed)
  let newCursor = cursor;
  if (!cursor || Object.keys(changes).length > 0) {
    newCursor = (await getLatestPublicActivityId()) ?? cursor;
  }

  return { changes, cursor: newCursor };
}

/**
 * Get latest public entity activity ID (for 'now' offset and as cursor).
 */
export async function getLatestPublicActivityId(): Promise<string | null> {
  const publicTypes = [...hierarchy.publicActionsTypes];

  if (publicTypes.length === 0) return null;

  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(inArray(activitiesTable.entityType, publicTypes))
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  return result[0]?.id ?? null;
}
