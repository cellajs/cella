import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { contextCountersTable } from '#/db/schema/context-counters';
import type { AppCatchupResponse } from '#/schemas';

/**
 * Fetch catchup summary for a user.
 *
 * Uses contextCountersTable for O(1) seq + mSeq lookup per org.
 * When clientSeqs are provided, scopes with matching seq AND mSeq
 * are excluded from the response — the client already has the correct state.
 *
 * When cursor is null (fresh connect), only seq/mSeq baselines are returned.
 */
export async function fetchUserCatchupSummary(
  userId: string,
  orgIds: Set<string>,
  cursor: string | null,
  clientSeqs?: Record<string, number>,
): Promise<AppCatchupResponse> {
  if (orgIds.size === 0) return { changes: {}, cursor };

  const orgIdArray = Array.from(orgIds);

  // Step 1: Get current seq + mSeq from contextCountersTable (fast PK lookup)
  const counterRows = await db
    .select({
      contextKey: contextCountersTable.contextKey,
      seq: contextCountersTable.seq,
      mSeq: contextCountersTable.mSeq,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, orgIdArray));

  const serverCounters = new Map(counterRows.map((r) => [r.contextKey, { seq: r.seq, mSeq: r.mSeq }]));

  // Step 2: Build changes for scopes with seq or mSeq gaps
  const changes: AppCatchupResponse['changes'] = {};
  const changedProductScopes: string[] = [];

  for (const orgId of orgIdArray) {
    const server = serverCounters.get(orgId) ?? { seq: 0, mSeq: 0 };
    const clientSeq = clientSeqs?.[orgId] ?? 0;
    const clientMSeq = clientSeqs?.[`${orgId}:m`] ?? 0;

    const seqChanged = !clientSeqs || server.seq !== clientSeq;
    const mSeqChanged = !clientSeqs || server.mSeq !== clientMSeq;

    if (seqChanged || mSeqChanged) {
      changes[orgId] = { seq: server.seq, mSeq: server.mSeq, deletedIds: [] };
      if (server.seq !== clientSeq) changedProductScopes.push(orgId);
    }
  }

  // Step 3: Query activities only for product entity deletes (changed scopes)
  // Membership no longer needs activities scan — mSeq gap is sufficient
  // Skipped entirely when no cursor (fresh connect — no cache to reconcile)
  if (cursor && changedProductScopes.length > 0) {
    const deletedResults = await db
      .select({
        organizationId: activitiesTable.organizationId,
        entityId: activitiesTable.entityId,
      })
      .from(activitiesTable)
      .where(
        and(
          gt(activitiesTable.id, cursor),
          inArray(activitiesTable.organizationId, changedProductScopes),
          inArray(activitiesTable.entityType, [...appConfig.productEntityTypes]),
          sql`${activitiesTable.action} = 'delete'`,
        ),
      )
      .limit(1000);

    for (const row of deletedResults) {
      if (row.entityId && row.organizationId && changes[row.organizationId]) {
        changes[row.organizationId].deletedIds.push(row.entityId);
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
