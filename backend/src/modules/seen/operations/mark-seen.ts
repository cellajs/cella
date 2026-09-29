import { and, eq, getColumns, gt, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ProductEntityType, SeenTrackedProductType } from 'shared';
import { appConfig, hierarchy, seenWindowMs } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { UserContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { homeChannelIdSql } from '#/db/utils/home-channel';
import { draftVisibleRowsPredicate } from '#/db/utils/published-predicate';
import { seenRecencySql } from '#/modules/seen/seen-queries';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

type OrgScopedEntityTable = AnyPgTable & {
  id: PgColumn;
  organizationId: PgColumn;
  createdAt: PgColumn;
};

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
  const parentColumn = parent
    ? columns[appConfig.entityIdColumnKeys[parent as keyof typeof appConfig.entityIdColumnKeys]]
    : undefined;
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

  log.debug(
    `markSeen: ${productType} x${entityIds.length} for org ${organization.id.slice(0, 8)} by ${user.id.slice(0, 8)}`,
  );

  if (!isTrackedProductType(productType)) {
    log.debug(`markSeen: skipping non-tracked type "${productType}"`);
    return { newCount: 0 };
  }

  const entityTable = getEntityTable(productType);

  const orgTable = entityTable as OrgScopedEntityTable;

  const channelIdColumn = homeChannelIdSql(productType, entityTable);

  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();

  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(ctx.var.memberships, productType, organization.id, actor);
  const scopeWhere = buildCollectionReadWhere(readFilter, entityTable, homeChannelColumn(productType), actor);
  if (scopeWhere.kind === 'none') return { newCount: 0 };

  const filters: SQL[] = [
    inArray(orgTable.id, entityIds),
    eq(orgTable.organizationId, organization.id),
    gt(seenRecencySql(orgTable), windowCutoff),
  ];
  const { deletedAt } = getColumns(entityTable) as Record<string, PgColumn | undefined>;
  if (deletedAt) filters.push(isNull(deletedAt));
  const draftVisible = draftVisibleRowsPredicate(entityTable, user.id);
  if (draftVisible) filters.push(draftVisible);
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // Use tenantContext to set RLS session vars; entity tables have row-level security.
  const { validIds, newCount } = await tenantContext(ctx, async (txCtx) => {
    const db = txCtx.var.db;
    const validEntities: { id: string; channelId: string }[] = await db
      .select({ id: orgTable.id, channelId: channelIdColumn })
      .from(entityTable)
      .where(and(...filters));

    const vIds = validEntities.map((e) => e.id);
    const ctxIdMap = new Map(validEntities.map((e) => [e.id, e.channelId]));

    if (vIds.length === 0) {
      return { validIds: vIds, entityChannelIdMap: ctxIdMap, newCount: 0 };
    }

    log.debug(`markSeen: ${vIds.length}/${entityIds.length} valid entities`);

    // Partitioning prevents a unique user/product arbiter, so concurrent duplicates are tolerated by EXISTS reads and corrected by counter recalculation.
    const values = sql.join(
      vIds.map(
        (entityId) =>
          sql`(${generateId()}::uuid, ${user.id}::uuid, ${entityId}::uuid, ${productType}, ${ctxIdMap.get(entityId) ?? organization.id}::uuid, ${organization.id}::uuid, ${organization.tenantId}, now())`,
      ),
      sql`, `,
    );

    const result = await db.execute<{ new_count: number }>(sql`
      WITH candidate (id, user_id, product_id, product_type, channel_id, organization_id, tenant_id, created_at) AS (
        VALUES ${values}
      ),
      inserted AS (
        INSERT INTO seen_by (id, user_id, product_id, product_type, channel_id, organization_id, tenant_id, created_at)
        SELECT c.id, c.user_id, c.product_id, c.product_type, c.channel_id, c.organization_id, c.tenant_id, c.created_at
        FROM candidate c
        WHERE NOT EXISTS (
          SELECT 1 FROM seen_by sb WHERE sb.user_id = c.user_id AND sb.product_id = c.product_id
        )
        RETURNING product_id
      ),
      counters AS (
        INSERT INTO product_counters (product_id, product_type, view_count, last_viewed_at)
        SELECT product_id, ${productType}, 1, now()
        FROM inserted
        ON CONFLICT (product_id) DO UPDATE SET
          view_count = product_counters.view_count + 1,
          last_viewed_at = now()
      )
      SELECT count(*)::int AS new_count FROM inserted
    `);

    const nc = Number(result.rows[0]?.new_count ?? 0);
    return { validIds: vIds, entityChannelIdMap: ctxIdMap, newCount: nc };
  });

  if (validIds.length === 0) {
    log.debug(`markSeen: 0 valid entities out of ${entityIds.length} submitted`);
    return { newCount: 0 };
  }

  log.debug(`markSeen: ${newCount} newly seen, ${validIds.length - newCount} already seen`);
  return { newCount };
}
