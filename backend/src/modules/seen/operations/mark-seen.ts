import { eq, gt, inArray, isNull, type SQL } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { hasDeletedAt } from '#/db/utils/audit-columns';
import { draftVisibleRowsPredicate } from '#/db/utils/published-predicate';
import { isTrackedProductType } from '#/modules/seen/helpers/tracked-products';
import { findSeenCandidates, insertSeenBy, type OrgScopedEntityTable, seenRecencySql, seenWindowStart } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

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
  if (hasDeletedAt(entityTable)) filters.push(isNull(entityTable.deletedAt));
  const draftVisible = draftVisibleRowsPredicate(entityTable, user.id);
  if (draftVisible) filters.push(draftVisible);
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // Use tenantContext to set RLS session vars; entity tables have row-level security.
  const newCount = await tenantContext(ctx, async (txCtx) => {
    const productIds = await findSeenCandidates(txCtx, { productType, where: filters });
    log.debug(`markSeen: ${productIds.length}/${entityIds.length} valid entities`);
    if (productIds.length === 0) return 0;

    return insertSeenBy(txCtx, { userId: user.id, productType, productIds });
  });

  log.debug(`markSeen: ${newCount} newly seen`);
  return { newCount };
}
