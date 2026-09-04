import { getColumns, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, type SeenTrackedProductType } from 'shared';
import type { AuthContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { groupingChannelTypes, seenWindowMs, trackedProductTypes } from '#/modules/seen/operations/mark-seen';
import { findUnseenCountsByUser } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';

/** Sub-context column for the read predicate: the parent-level id column, org fallback. */
const homeChannelColumn = (productType: SeenTrackedProductType): PgColumn => {
  const table = getEntityTable(productType);
  const columns = getColumns(table) as Record<string, PgColumn | undefined>;
  const parent = hierarchy.getParent(productType);
  const parentColumn = parent
    ? columns[appConfig.entityIdColumnKeys[parent as keyof typeof appConfig.entityIdColumnKeys]]
    : undefined;
  const column = parentColumn ?? columns.organizationId;
  if (!column) throw new Error(`[Seen] No sub-context column for "${productType}"`);
  return column;
};

export async function getUnseenCountsOp(ctx: AuthContext) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  const actor = actorFrom(ctx);

  // No memberships means no badge contexts: administrator bypass widens rows inside an organization, not the organization set.
  if (memberships.length === 0 || new Set(trackedProductTypes).size === 0) {
    return {};
  }

  // Any tracked type with no parent groups by org → org ids join the context id set.
  const needsOrgFallback = trackedProductTypes.some((t) => !hierarchy.getParent(t));

  // Read scopes are org-scoped, so counts run per org, and inside tenantRead because entity tables have row-level security.
  const orgGroups = new Map<string, { tenantId: string; channelIds: Set<string> }>();
  for (const m of memberships) {
    const group = orgGroups.get(m.organizationId) ?? { tenantId: m.tenantId, channelIds: new Set<string>() };
    if (groupingChannelTypes.has(m.channelType)) group.channelIds.add(m.channelId);
    if (needsOrgFallback) group.channelIds.add(m.organizationId);
    orgGroups.set(m.organizationId, group);
  }

  if (orgGroups.size === 0) {
    return {};
  }

  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();
  const results: Record<string, Record<string, number>> = {};

  // Compose each tracked type's collection read predicate so badges only count rows this user can fetch.
  for (const [organizationId, { tenantId, channelIds }] of orgGroups) {
    const scopeWhereByType: Partial<Record<SeenTrackedProductType, SQL | undefined>> = {};
    const readableTypes: SeenTrackedProductType[] = [];

    for (const productType of trackedProductTypes) {
      const readFilter = resolveCollectionReadFilter(memberships, productType, organizationId, actor);
      const scopeWhere = buildCollectionReadWhere(
        readFilter,
        getEntityTable(productType),
        homeChannelColumn(productType),
        actor,
      );
      if (scopeWhere.kind === 'none') continue;
      readableTypes.push(productType);
      if (scopeWhere.kind === 'where') scopeWhereByType[productType] = scopeWhere.where;
    }
    if (readableTypes.length === 0) continue;

    const unseenRows = await tenantRead({ var: { ...ctx.var, tenantId } } as AuthContext, (readCtx) =>
      findUnseenCountsByUser(readCtx, {
        userId: user.id,
        channelIds: [...channelIds],
        productTypes: readableTypes,
        cutoff: windowCutoff,
        scopeWhereByType,
      }),
    );

    for (const row of unseenRows) {
      if (row.unseenCount <= 0) continue;
      if (!results[row.channelId]) results[row.channelId] = {};
      results[row.channelId][row.productType] = row.unseenCount;
    }
  }

  return results;
}
