import { hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { groupingContextTypes, trackedEntityTypes } from '#/modules/seen/operations/mark-seen';
import { findContextCounters, findSeenCountsByUser } from '#/modules/seen/seen-queries';

export async function getUnseenCountsOp(ctx: AuthContext) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  const trackedEntityTypeSet = new Set<string>(trackedEntityTypes);

  if (memberships.length === 0 || trackedEntityTypeSet.size === 0) {
    return {};
  }

  // Collect context entity IDs from memberships whose contextType groups seen counts
  const contextIds: string[] = [];
  for (const m of memberships) {
    if (!groupingContextTypes.has(m.contextType)) continue;
    contextIds.push(m.contextId);
  }

  // Fallback: if any tracked type has no parent, group by org → collect org IDs
  const needsOrgFallback = trackedEntityTypes.some((t) => !hierarchy.getParent(t));
  if (needsOrgFallback) {
    const organizationIds = new Set(memberships.map((m) => m.organizationId));
    for (const id of organizationIds) contextIds.push(id);
  }

  if (contextIds.length === 0) {
    return {};
  }

  const uniqueContextIds = [...new Set(contextIds)];

  // 1. Total entity counts per context from context_counters (no RLS, pre-computed)
  const totalByContext = new Map<string, Map<string, number>>();

  const counterRows = await findContextCounters({ var: { db: baseDb } }, { contextIds: uniqueContextIds });

  for (const row of counterRows) {
    for (const trackedType of trackedEntityTypes) {
      const total = row.counts[`e:${trackedType}`] ?? 0;
      if (total <= 0) continue;

      let typeMap = totalByContext.get(row.contextKey);
      if (!typeMap) {
        typeMap = new Map();
        totalByContext.set(row.contextKey, typeMap);
      }
      typeMap.set(trackedType, total);
    }
  }

  // 2. User's seen counts from seen_by grouped by contextId + entityType (no RLS)
  const seenRows = await findSeenCountsByUser(
    { var: { db: baseDb } },
    {
      userId: user.id,
      contextIds: uniqueContextIds,
    },
  );

  // 3. Build seen map: { [contextId]: { [entityType]: seenCount } }
  const seenByContext = new Map<string, Map<string, number>>();
  for (const row of seenRows) {
    let typeMap = seenByContext.get(row.contextId);
    if (!typeMap) {
      typeMap = new Map();
      seenByContext.set(row.contextId, typeMap);
    }
    typeMap.set(row.entityType, Number(row.seenCount));
  }

  // 4. Compute unseen = total − seen (floored at 0)
  const results: Record<string, Record<string, number>> = {};

  for (const [contextId, typeMap] of totalByContext) {
    for (const [trackedType, total] of typeMap) {
      if (total <= 0) continue;

      const seen = seenByContext.get(contextId)?.get(trackedType) ?? 0;
      const unseen = Math.max(0, total - seen);
      if (unseen > 0) {
        if (!results[contextId]) results[contextId] = {};
        results[contextId][trackedType] = unseen;
      }
    }
  }

  return results;
}
