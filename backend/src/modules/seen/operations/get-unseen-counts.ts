import { getColumns, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, type SeenTrackedEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { groupingContextTypes, seenWindowMs, trackedEntityTypes } from '#/modules/seen/operations/mark-seen';
import { findUnseenCountsByUser } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/actor';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';

/** Sub-context column for the read predicate: the parent-level id column, org fallback. */
const subContextColumn = (entityType: SeenTrackedEntityType): PgColumn => {
  const table = getEntityTable(entityType);
  const columns = getColumns(table) as Record<string, PgColumn | undefined>;
  const parent = hierarchy.getParent(entityType);
  const parentColumn = parent
    ? columns[appConfig.entityIdColumnKeys[parent as keyof typeof appConfig.entityIdColumnKeys]]
    : undefined;
  const column = parentColumn ?? columns.organizationId;
  if (!column) throw new Error(`[Seen] No sub-context column for "${entityType}"`);
  return column;
};

export async function getUnseenCountsOp(ctx: AuthContext) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  const actor = actorFrom(ctx);

  // Set() widens the fixed-length config tuple so an empty fork config is a real runtime check.
  // Counts are grouped by the caller's org memberships, so no memberships means nothing to
  // count — including for system admins, whose bypass widens rows WITHIN an org, not the set
  // of orgs they are counted against.
  if (memberships.length === 0 || new Set(trackedEntityTypes).size === 0) {
    return {};
  }

  // Any tracked type with no parent groups by org → org ids join the context id set.
  const needsOrgFallback = trackedEntityTypes.some((t) => !hierarchy.getParent(t));

  // Group the user's context ids by ORG (mirror rule: read scopes are org-scoped, so the
  // count runs per org with that org's predicate). Entity tables have FORCE ROW LEVEL
  // SECURITY with a tenant-scoped policy, so each count runs inside tenantRead.
  const orgGroups = new Map<string, { tenantId: string; contextIds: Set<string> }>();
  for (const m of memberships) {
    const group = orgGroups.get(m.organizationId) ?? { tenantId: m.tenantId, contextIds: new Set<string>() };
    if (groupingContextTypes.has(m.contextType)) group.contextIds.add(m.contextId);
    if (needsOrgFallback) group.contextIds.add(m.organizationId);
    orgGroups.set(m.organizationId, group);
  }

  if (orgGroups.size === 0) {
    return {};
  }

  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();
  const results: Record<string, Record<string, number>> = {};

  // Per org: compose each tracked type's collection read predicate (same compiler as
  // list endpoints) so badges only count rows this user can actually fetch — the seen
  // counter is a change signal that must mirror the feed, never a wider number.
  for (const [organizationId, { tenantId, contextIds }] of orgGroups) {
    const scopeWhereByType: Partial<Record<SeenTrackedEntityType, SQL | undefined>> = {};
    const readableTypes: SeenTrackedEntityType[] = [];

    for (const entityType of trackedEntityTypes) {
      const readFilter = resolveCollectionReadFilter(memberships, entityType, organizationId, actor);
      const scopeWhere = buildCollectionReadWhere(
        readFilter,
        getEntityTable(entityType),
        subContextColumn(entityType),
        actor,
      );
      if (scopeWhere.kind === 'none') continue;
      readableTypes.push(entityType);
      if (scopeWhere.kind === 'where') scopeWhereByType[entityType] = scopeWhere.where;
    }
    if (readableTypes.length === 0) continue;

    const unseenRows = await tenantRead({ var: { ...ctx.var, tenantId } } as AuthContext, (readCtx) =>
      findUnseenCountsByUser(readCtx, {
        userId: user.id,
        contextIds: [...contextIds],
        entityTypes: readableTypes,
        cutoff: windowCutoff,
        scopeWhereByType,
      }),
    );

    for (const row of unseenRows) {
      if (row.unseenCount <= 0) continue;
      if (!results[row.contextId]) results[row.contextId] = {};
      results[row.contextId][row.entityType] = row.unseenCount;
    }
  }

  return results;
}
