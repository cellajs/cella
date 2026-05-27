/**
 * App stream catch-up operation.
 *
 * Dual-level change detection:
 *   1. Org-level: O(1) entitySeqs check per org (quick screening)
 *   2. Sub-context: for changed orgs, drill into sub-context counters (precision)
 *
 * Entity seqs (from CDC worker) detect creates/updates.
 * Deletes and membership changes are always scanned from the activities table (cursor-bounded, watertight).
 *
 * When cursor is null (fresh connect), baselines are returned and membership
 * queries are always invalidated on the client side.
 */

import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { baseDb as db } from '#/db/db';
import {
  findContextCountersByKeys,
  findDeleteAndMembershipActivities,
  findLatestUserActivityId,
} from '#/modules/entities/entities-queries';
import { collectSubContextIds } from '#/modules/entities/helpers/collect-sub-context-ids';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import { buildPropagationHints } from '#/modules/entities/helpers/propagation-hints';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { AppCatchupResponse } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

export async function appCatchupOp(
  memberships: MembershipBaseModel[],
  cursor?: string,
  seqs?: Record<string, number>,
): Promise<OperationResult<AppCatchupResponse>> {
  const organizationIds = new Set(memberships.map((m) => m.organizationId));

  if (organizationIds.size === 0) return { success: true, data: { changes: {}, cursor: cursor ?? null } };

  const organizationIdArray = Array.from(organizationIds);

  // Collect sub-context IDs (e.g., projectId) from memberships for all orgs upfront
  const { byOrg: subContextIdsByOrg, all: allSubContextIdSet } = collectSubContextIds(memberships);
  const allSubContextIds = [...allSubContextIdSet];

  // Step 1: Single query for all org + sub-context counters
  const allCounterRows = await findContextCountersByKeys(dbCtx, [...organizationIdArray, ...allSubContextIds]);
  const allCounters = new Map(allCounterRows.map((r) => [r.contextKey, r.counts]));

  // Step 2: Build changes entries for all orgs (prune empty ones at the end)
  const changes: AppCatchupResponse['changes'] = {};

  for (const organizationId of organizationIdArray) {
    const { entitySeqs, entityCounts } = parseCounterCounts(allCounters.get(organizationId));

    changes[organizationId] = {
      deletedByType: {},
      entitySeqs: Object.keys(entitySeqs).length > 0 ? entitySeqs : undefined,
      entityCounts: Object.keys(entityCounts).length > 0 ? entityCounts : undefined,
    };

    // Attach sub-context data
    const contextIds = subContextIdsByOrg.get(organizationId);
    if (contextIds) {
      const childContextChanges: Record<
        string,
        { entitySeqs?: Record<string, number>; entityCounts?: Record<string, number> }
      > = {};

      for (const contextId of contextIds) {
        const { entitySeqs: ctxSeqs, entityCounts: ctxCounts } = parseCounterCounts(allCounters.get(contextId));
        if (Object.keys(ctxSeqs).length > 0 || Object.keys(ctxCounts).length > 0) {
          childContextChanges[contextId] = {
            entitySeqs: Object.keys(ctxSeqs).length > 0 ? ctxSeqs : undefined,
            entityCounts: Object.keys(ctxCounts).length > 0 ? ctxCounts : undefined,
          };
        }
      }

      if (Object.keys(childContextChanges).length > 0) {
        changes[organizationId].childContextChanges = childContextChanges;
      }
    }
  }

  // Step 3: Scan activities for deletes AND membership changes (cursor-bounded, watertight)
  if (cursor) {
    const activityResults = await findDeleteAndMembershipActivities(dbCtx, cursor, organizationIdArray, [
      ...appConfig.productEntityTypes,
    ]);

    for (const row of activityResults) {
      if (!row.organizationId || !changes[row.organizationId]) continue;

      // Membership activity — org entry already exists, client will invalidate membership queries
      if (row.resourceType === 'membership') continue;

      // Product entity delete
      if (!row.subjectId || !row.entityType) continue;
      const scope = changes[row.organizationId];
      if (!scope.deletedByType[row.entityType]) scope.deletedByType[row.entityType] = [];
      scope.deletedByType[row.entityType].push(row.subjectId);
    }
  }

  // Step 4: Build propagation hints for embedding relationships
  await buildPropagationHints(changes, seqs);

  // Step 5: Prune orgs with no changes (seqs match client and no deletes/propagation)
  if (seqs) {
    for (const [orgId, scope] of Object.entries(changes)) {
      const hasDeletes = Object.keys(scope.deletedByType).length > 0;
      const hasPropagation = scope.propagation && scope.propagation.length > 0;
      const seqsMatch =
        !scope.entitySeqs ||
        Object.entries(scope.entitySeqs).every(([entityType, serverVal]) => {
          return seqs[`${orgId}:s:${entityType}`] === serverVal;
        });

      if (seqsMatch && !hasDeletes && !hasPropagation) {
        delete changes[orgId];
      }
    }
  }

  // Step 6: Advance cursor (skip query if nothing changed)
  let newCursor: string | null = cursor ?? null;
  if (!cursor || Object.keys(changes).length > 0) {
    newCursor =
      (await findLatestUserActivityId(dbCtx, Array.from(organizationIds), [
        ...appConfig.productEntityTypes,
        ...appConfig.contextEntityTypes,
      ])) ??
      cursor ??
      null;
  }

  return { success: true, data: { changes, cursor: newCursor } };
}

/**
 * Get the latest activity ID relevant to a user.
 * Used for 'now' offset and as new cursor in catchup responses.
 * Exported for use by stream handler.
 */
export async function getLatestUserActivityId(organizationIds: Set<string>): Promise<string | null> {
  if (organizationIds.size === 0) return null;

  return findLatestUserActivityId(dbCtx, Array.from(organizationIds), [
    ...appConfig.productEntityTypes,
    ...appConfig.contextEntityTypes,
  ]);
}
