import { eq, getColumns, gt, inArray, isNull, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ProductEntityType, SeenTrackedProductType } from 'shared';
import { appConfig, hierarchy, seenWindowMs } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { draftVisibleRowsPredicate } from '#/db/utils/published-predicate';
import { findSeenCandidates, insertSeenBy, seenRecencySql } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

type OrgScopedEntityTable = AnyPgTable & { id: PgColumn; organizationId: PgColumn; createdAt: PgColumn };

export const trackedProductTypes = appConfig.seenTrackedProductTypes;
const trackedProductTypeSet = new Set<string>(trackedProductTypes);

/** 90-day rolling window shared with the client; older entities are ignored. */
export { seenWindowMs };

export function isTrackedProductType(productType: string): productType is SeenTrackedProductType {
  return trackedProductTypeSet.has(productType);
}

/** Context types that group unseen counts: every possible home channel of a tracked row. */
export const groupingChannelTypes = new Set(trackedProductTypes.flatMap((t) => hierarchy.possibleHomeChannels(t)));

/** Sub-context column for the read predicate: the parent-level id column, org fallback. */
export const homeChannelColumn = (productType: SeenTrackedProductType): PgColumn => {
  const table = getEntityTable(productType);
  const columns = getColumns(table) as Record<string, PgColumn | undefined>;
  const parent = hierarchy.getParent(productType);
  const parentColumn = parent ? columns[appConfig.entityIdColumnKeys[parent as keyof typeof appConfig.entityIdColumnKeys]] : undefined;
  const column = parentColumn ?? columns.organizationId;
  if (!column) throw new Error(`[Seen] No sub-context column for "${productType}"`);
  return column;
};

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

  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();

  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(ctx.var.memberships, productType, organization.id, actor);
  const scopeWhere = buildCollectionReadWhere(readFilter, entityTable, homeChannelColumn(productType), actor);
  if (scopeWhere.kind === 'none') return { newCount: 0 };

  const filters: SQL[] = [inArray(orgTable.id, entityIds), eq(orgTable.organizationId, organization.id), gt(seenRecencySql(orgTable), windowCutoff)];
  const { deletedAt } = getColumns(entityTable) as Record<string, PgColumn | undefined>;
  if (deletedAt) filters.push(isNull(deletedAt));
  const draftVisible = draftVisibleRowsPredicate(entityTable, user.id);
  if (draftVisible) filters.push(draftVisible);
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // Use tenantContext to set RLS session vars; entity tables have row-level security.
  const { validIds, newCount } = await tenantContext(ctx, async (txCtx) => {
    const validEntities = await findSeenCandidates(txCtx, { productType, where: filters });
    const vIds = validEntities.map((e) => e.id);
    if (vIds.length === 0) return { validIds: vIds, newCount: 0 };

    log.debug(`markSeen: ${vIds.length}/${entityIds.length} valid entities`);

    const rows = validEntities.map(({ id, channelId }) => ({ productId: id, channelId: channelId ?? organization.id }));
    const nc = await insertSeenBy(txCtx, { userId: user.id, productType, organizationId: organization.id, tenantId: organization.tenantId, rows });
    return { validIds: vIds, newCount: nc };
  });

  if (validIds.length === 0) {
    log.debug(`markSeen: 0 valid entities out of ${entityIds.length} submitted`);
    return { newCount: 0 };
  }

  log.debug(`markSeen: ${newCount} newly seen, ${validIds.length - newCount} already seen`);
  return { newCount };
}
