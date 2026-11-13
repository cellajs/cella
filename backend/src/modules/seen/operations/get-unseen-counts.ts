import type { SQL } from 'drizzle-orm';
import { appConfig, type SeenTrackedProductType, seenGroupingChannelTypes } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { findUnseenCountsByUser, seenWindowStart } from '#/modules/seen/seen-queries';
import { accessFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';

/**
 * The user's unseen counts per home channel and product type, `{}` without memberships. Only rows the user may read
 * count: live, published, inside the seen window and newer than the user's membership of the row's home channel, so a
 * new member starts with no backlog. The client mirrors no membership cutoff: its deltas count only rows newer than its
 * last recount.
 */
export async function getUnseenCountsOp(ctx: UserContext) {
  const { user, memberships } = ctx.var;
  const access = accessFrom(ctx);

  // No memberships means no channels to badge: administrator bypass widens rows inside an organization, not the organization set.
  if (memberships.length === 0) return {};

  // Read scopes are org-scoped, so counts run per org, and inside a tenant read because entity tables have row-level security.
  const windowStart = Date.parse(seenWindowStart());
  const orgGroups = new Map<string, { tenantId: string; channels: { id: string; cutoff: string }[] }>();
  for (const m of memberships) {
    const group = orgGroups.get(m.organizationId) ?? { tenantId: m.tenantId, channels: [] };
    const cutoff = new Date(Math.max(windowStart, Date.parse(m.createdAt))).toISOString();
    // A user holds one membership per channel, so each channel is listed once.
    if (seenGroupingChannelTypes.has(m.channelType)) group.channels.push({ id: m.channelId, cutoff });
    orgGroups.set(m.organizationId, group);
  }

  const results: Record<string, Record<string, number>> = {};

  for (const [organizationId, { tenantId, channels }] of orgGroups) {
    const scopeWhereByType: Partial<Record<SeenTrackedProductType, SQL | undefined>> = {};
    const readableTypes: SeenTrackedProductType[] = [];

    for (const productType of appConfig.seenTrackedProductTypes) {
      const readFilter = resolveCollectionReadFilter(access, productType, organizationId);
      const entityTable = getEntityTable(productType);
      const scopeWhere = buildCollectionReadWhere(readFilter, entityTable, access);
      if (scopeWhere.kind === 'none') continue;
      readableTypes.push(productType);
      if (scopeWhere.kind === 'where') scopeWhereByType[productType] = scopeWhere.where;
    }
    if (readableTypes.length === 0) continue;

    // The route has no tenant guard: each organization's rows are read as its own tenant.
    const unseenRows = await tenantRead(
      ctx,
      (readCtx) => findUnseenCountsByUser(readCtx, { userId: user.id, channels, productTypes: readableTypes, scopeWhereByType }),
      { tenantId },
    );

    for (const row of unseenRows) {
      if (!results[row.channelId]) results[row.channelId] = {};
      results[row.channelId][row.productType] = row.unseenCount;
    }
  }

  return results;
}
