import { eq, getColumns, gt, inArray, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { ProductEntityType, SeenTrackedProductType } from 'shared';
import { appConfig, hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { draftVisibleRowsPredicate } from '#/db/utils/published-predicate';
import { findSeenCandidates, insertSeenBy, type OrgScopedEntityTable, seenRecencySql, seenWindowStart } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

export const trackedProductTypes = appConfig.seenTrackedProductTypes;
const trackedProductTypeSet = new Set<string>(trackedProductTypes);

export function isTrackedProductType(productType: string): productType is SeenTrackedProductType {
  return trackedProductTypeSet.has(productType);
}

/** Context types that group unseen counts: every possible home channel of a tracked row. */
export const groupingChannelTypes = new Set(trackedProductTypes.flatMap((t) => hierarchy.possibleHomeChannels(t)));

/**
 * Records the rows the user newly saw and bumps their view counts; returns how many were new. Only rows the user may
 * read count, by the unseen counts' read scope, live rows only and drafts for their author, so the count never
 * confirms that a hidden row exists.
 */
export async function markSeenOp(ctx: UserContext, entityIds: string[], productType: ProductEntityType) {
  const user = ctx.var.user;
  const organization = ctx.var.organization;

  log.debug(`markSeen: ${productType} x${entityIds.length} for org ${organization.id.slice(0, 8)} by ${user.id.slice(0, 8)}`);

  if (!isTrackedProductType(productType)) {
    log.debug(`markSeen: skipping non-tracked type "${productType}"`);
    return { newCount: 0 };
  }

  const entityTable = getEntityTable(productType);

  const orgTable = entityTable as OrgScopedEntityTable;

  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(ctx.var.memberships, productType, organization.id, actor);
  const scopeWhere = buildCollectionReadWhere(readFilter, entityTable, productType, actor);
  if (scopeWhere.kind === 'none') return { newCount: 0 };

  const filters: SQL[] = [
    inArray(orgTable.id, entityIds),
    eq(orgTable.organizationId, organization.id),
    gt(seenRecencySql(orgTable), seenWindowStart()),
  ];
  const { deletedAt } = getColumns(entityTable) as Record<string, PgColumn | undefined>;
  if (deletedAt) filters.push(isNull(deletedAt));
  const draftVisible = draftVisibleRowsPredicate(entityTable, user.id);
  if (draftVisible) filters.push(draftVisible);
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // Use tenantContext to set RLS session vars; entity tables have row-level security.
  const newCount = await tenantContext(ctx, async (txCtx) => {
    const validEntities = await findSeenCandidates(txCtx, { productType, where: filters });
    log.debug(`markSeen: ${validEntities.length}/${entityIds.length} valid entities`);
    if (validEntities.length === 0) return 0;

    const rows = validEntities.map(({ id, channelId }) => ({ productId: id, channelId }));
    return insertSeenBy(txCtx, { userId: user.id, productType, organizationId: organization.id, tenantId: organization.tenantId, rows });
  });

  log.debug(`markSeen: ${newCount} newly seen`);
  return { newCount };
}
