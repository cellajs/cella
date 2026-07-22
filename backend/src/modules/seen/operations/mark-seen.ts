import { and, eq, getColumns, gt, inArray, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { ProductEntityType, SeenTrackedProductType } from 'shared';
import { appConfig, hierarchy, possibleHomeChannels, seenWindowMs } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { AuthContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

type OrgScopedEntityTable = AnyPgTable & {
  id: PgColumn;
  organizationId: PgColumn;
  createdAt: PgColumn;
};

/** Product entity types tracked for seen/unseen, configured in appConfig.seenTrackedProductTypes. */
export const trackedProductTypes = appConfig.seenTrackedProductTypes;
const trackedProductTypeSet = new Set<string>(trackedProductTypes);

/** 90-day rolling window; older entities are ignored for seen/unseen tracking. Single source in
 * `shared` so client-side unseen tracking uses the same window. */
export { seenWindowMs };

/** Type guard: narrows a product entity type to a seen-tracked entity type */
export function isTrackedProductType(productType: string): productType is SeenTrackedProductType {
  return trackedProductTypeSet.has(productType);
}

/** Context types that group unseen counts: every context a tracked row can have as its effective home */
export const groupingChannelTypes = new Set(trackedProductTypes.flatMap((t) => possibleHomeChannels(hierarchy, t)));

export async function markSeenOp(ctx: AuthContext, entityIds: string[], productType: ProductEntityType) {
  const user = ctx.var.user;
  const organization = ctx.var.organization;

  log.debug(
    `markSeen: ${productType} x${entityIds.length} for org ${organization.id.slice(0, 8)} by ${user.id.slice(0, 8)}`,
  );

  // Only configured tracked entity types are accepted
  if (!isTrackedProductType(productType)) {
    log.debug(`markSeen: skipping non-tracked type "${productType}"`);
    return { newCount: 0 };
  }

  // After narrowing, productType is SeenTrackedProductType and a valid key of entityTables.
  const entityTable = getEntityTable(productType);

  // Narrow to org-scoped table shape (all org-scoped product tables have these columns)
  const orgTable = entityTable as OrgScopedEntityTable;
  const columns = getColumns(entityTable);

  // Derive the row's home context id: deepest non-null ancestor (e.g. task → projectId; a
  // variable-depth row with a null parent column falls through to the next ancestor). Must
  // match the notification channelId (build-message) or unseen badges land under the wrong key.
  const ancestorColumns = hierarchy
    .getOrderedAncestors(productType)
    .map((ancestor) => (columns as Record<string, PgColumn | undefined>)[appConfig.entityIdColumnKeys[ancestor]])
    .filter((column): column is PgColumn => Boolean(column));
  const channelIdColumn = ancestorColumns.length
    ? sql<string>`COALESCE(${sql.join(ancestorColumns, sql`, `)})`
    : orgTable.organizationId;

  // Filter to only entities that exist, belong to this org, and are within 90-day window
  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();

  // Use tenantContext to set RLS session vars; entity tables have FORCE ROW LEVEL SECURITY.
  const { validIds, newCount } = await tenantContext(ctx, async (txCtx) => {
    const db = txCtx.var.db;
    const validEntities: { id: string; channelId: string }[] = await db
      .select({ id: orgTable.id, channelId: channelIdColumn })
      .from(entityTable)
      .where(
        and(
          inArray(orgTable.id, entityIds),
          eq(orgTable.organizationId, organization.id),
          gt(orgTable.createdAt, windowCutoff),
        ),
      );

    const vIds = validEntities.map((e) => e.id);
    const ctxIdMap = new Map(validEntities.map((e) => [e.id, e.channelId]));

    if (vIds.length === 0) {
      return { validIds: vIds, entityChannelIdMap: ctxIdMap, newCount: 0 };
    }

    log.debug(`markSeen: ${vIds.length}/${entityIds.length} valid entities`);

    // Insert unseen rows, increment counters only for inserted candidates, and return their count.
    // Partitioning prevents a unique user/product arbiter, so concurrent duplicates are tolerated
    // by EXISTS-based reads and corrected by counter recalculation.
    const values = sql.join(
      vIds.map(
        (entityId) =>
          sql`(${generateId()}::uuid, ${user.id}::uuid, ${entityId}::uuid, ${productType}, ${ctxIdMap.get(entityId) ?? organization.id}::uuid, ${organization.id}::uuid, ${organization.tenantId}, now())`,
      ),
      sql`, `,
    );

    const result = await db.execute(sql`
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

    const nc = Number((result as unknown as { rows: { new_count: number }[] }).rows[0]?.new_count ?? 0);
    return { validIds: vIds, entityChannelIdMap: ctxIdMap, newCount: nc };
  });

  if (validIds.length === 0) {
    log.debug(`markSeen: 0 valid entities out of ${entityIds.length} submitted`);
    return { newCount: 0 };
  }

  log.debug(`markSeen: ${newCount} newly seen, ${validIds.length - newCount} already seen`);
  return { newCount };
}
