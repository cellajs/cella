import type { SQL } from 'drizzle-orm';
import type { SeenTrackedProductType } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantReadAs } from '#/db/tenant-context';
import { groupingChannelTypes, trackedProductTypes } from '#/modules/seen/operations/mark-seen';
import { findUnseenCountsByUser, seenWindowStart } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';

export async function getUnseenCountsOp(ctx: UserContext) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  const actor = actorFrom(ctx);

  // No memberships means no badge contexts: administrator bypass widens rows inside an organization, not the organization set.
  if (memberships.length === 0) {
    return {};
  }

  // Read scopes are org-scoped, so counts run per org, and inside a tenant read because entity tables have row-level security.
  const orgGroups = new Map<string, { tenantId: string; channelIds: Set<string> }>();
  for (const m of memberships) {
    const group = orgGroups.get(m.organizationId) ?? { tenantId: m.tenantId, channelIds: new Set<string>() };
    if (groupingChannelTypes.has(m.channelType)) group.channelIds.add(m.channelId);
    orgGroups.set(m.organizationId, group);
  }

  const windowCutoff = seenWindowStart();
  const results: Record<string, Record<string, number>> = {};

  // Compose each tracked type's collection read predicate so badges only count rows this user can fetch.
  for (const [organizationId, { tenantId, channelIds }] of orgGroups) {
    const scopeWhereByType: Partial<Record<SeenTrackedProductType, SQL | undefined>> = {};
    const readableTypes: SeenTrackedProductType[] = [];

    for (const productType of trackedProductTypes) {
      const readFilter = resolveCollectionReadFilter(memberships, productType, organizationId, actor);
      const entityTable = getEntityTable(productType);
      const scopeWhere = buildCollectionReadWhere(readFilter, entityTable, productType, actor);
      if (scopeWhere.kind === 'none') continue;
      readableTypes.push(productType);
      if (scopeWhere.kind === 'where') scopeWhereByType[productType] = scopeWhere.where;
    }
    if (readableTypes.length === 0) continue;

    // The route has no tenant guard: each organization's rows are read as its own tenant.
    const unseenRows = await tenantReadAs(ctx, tenantId, (readCtx) =>
      findUnseenCountsByUser(readCtx, {
        userId: user.id,
        channelIds: [...channelIds],
        productTypes: readableTypes,
        cutoff: windowCutoff,
        scopeWhereByType,
      }),
    );

    for (const row of unseenRows) {
      if (!results[row.channelId]) results[row.channelId] = {};
      results[row.channelId][row.productType] = row.unseenCount;
    }
  }

  return results;
}
