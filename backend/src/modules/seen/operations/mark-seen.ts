import { and, eq, getColumns, gt, inArray, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { SeenTrackedEntityType } from 'shared';
import { appConfig, hierarchy, possibleHomeContexts } from 'shared';
import { generateId } from 'shared/entity-id';
import type { AuthContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { getEntityTable } from '#/tables';
import { log } from '#/utils/logger';

type OrgScopedEntityTable = AnyPgTable & {
  id: PgColumn;
  organizationId: PgColumn;
  createdAt: PgColumn;
};

/** Product entity types tracked for seen/unseen — configured in appConfig.seenTrackedEntityTypes */
export const trackedEntityTypes = appConfig.seenTrackedEntityTypes;
const trackedEntityTypeSet = new Set<string>(trackedEntityTypes);

/** 90-day rolling window — entities older than this are ignored for seen/unseen tracking */
export const seenWindowMs = 90 * 24 * 60 * 60 * 1000;

/** Type guard: narrows a product entity type to a seen-tracked entity type */
export function isTrackedEntityType(entityType: string): entityType is SeenTrackedEntityType {
  return trackedEntityTypeSet.has(entityType);
}

/** Context types that group unseen counts: every context a tracked row can have as its effective home */
export const groupingContextTypes = new Set(trackedEntityTypes.flatMap((t) => possibleHomeContexts(hierarchy, t)));

export async function markSeenOp(ctx: AuthContext, entityIds: string[], entityType: string) {
  const user = ctx.var.user;
  const organization = ctx.var.organization;

  log.debug(
    `markSeen: ${entityType} x${entityIds.length} for org ${organization.id.slice(0, 8)} by ${user.id.slice(0, 8)}`,
  );

  // Only configured tracked entity types are accepted
  if (!isTrackedEntityType(entityType)) {
    log.debug(`markSeen: skipping non-tracked type "${entityType}"`);
    return { newCount: 0 };
  }

  // After narrowing, entityType is SeenTrackedEntityType — a valid key of entityTables
  const entityTable = getEntityTable(entityType);

  // Narrow to org-scoped table shape (all org-scoped product tables have these columns)
  const orgTable = entityTable as OrgScopedEntityTable;
  const columns = getColumns(entityTable);

  // Derive the row's home context id: deepest non-null ancestor (e.g. task → projectId; a
  // variable-depth row with a null parent column falls through to the next ancestor). Must
  // match the notification contextId (build-message) or unseen badges land under the wrong key.
  const ancestorColumns = hierarchy
    .getOrderedAncestors(entityType)
    .map((ancestor) => (columns as Record<string, PgColumn | undefined>)[appConfig.entityIdColumnKeys[ancestor]])
    .filter((column): column is PgColumn => Boolean(column));
  const contextIdColumn = ancestorColumns.length
    ? sql<string>`COALESCE(${sql.join(ancestorColumns, sql`, `)})`
    : orgTable.organizationId;

  // Filter to only entities that exist, belong to this org, and are within 90-day window
  const windowCutoff = new Date(Date.now() - seenWindowMs).toISOString();

  // Use tenantContext to set RLS session vars — entity tables have FORCE ROW LEVEL SECURITY
  const { validIds, newCount } = await tenantContext(ctx, async (txCtx) => {
    const db = txCtx.var.db;
    const validEntities: { id: string; contextId: string }[] = await db
      .select({ id: orgTable.id, contextId: contextIdColumn })
      .from(entityTable)
      .where(
        and(
          inArray(orgTable.id, entityIds),
          eq(orgTable.organizationId, organization.id),
          gt(orgTable.createdAt, windowCutoff),
        ),
      );

    const vIds = validEntities.map((e) => e.id);
    const ctxIdMap = new Map(validEntities.map((e) => [e.id, e.contextId]));

    if (vIds.length === 0) {
      return { validIds: vIds, entityContextIdMap: ctxIdMap, newCount: 0 };
    }

    log.debug(`markSeen: ${vIds.length}/${entityIds.length} valid entities`);

    // Single-roundtrip CTE that:
    // 1. Bulk-inserts seen_by rows, skipping duplicates (ON CONFLICT DO NOTHING)
    // 2. Upserts product_counters only for newly inserted rows (increments view_count)
    // 3. Returns the count of genuinely new seen records
    const values = sql.join(
      vIds.map(
        (entityId) =>
          sql`(${generateId()}, ${user.id}, ${entityId}, ${entityType}, ${ctxIdMap.get(entityId) ?? organization.id}, ${organization.id}, ${organization.tenantId}, now())`,
      ),
      sql`, `,
    );

    const result = await db.execute(sql`
      WITH inserted AS (
        INSERT INTO seen_by (id, user_id, entity_id, entity_type, context_id, organization_id, tenant_id, created_at)
        VALUES ${values}
        ON CONFLICT (user_id, entity_id) DO NOTHING
        RETURNING entity_id
      ),
      counters AS (
        INSERT INTO product_counters (entity_id, entity_type, view_count, last_viewed_at)
        SELECT entity_id, ${entityType}, 1, now()
        FROM inserted
        ON CONFLICT (entity_id) DO UPDATE SET
          view_count = product_counters.view_count + 1,
          last_viewed_at = now()
      )
      SELECT count(*)::int AS new_count FROM inserted
    `);

    const nc = Number((result as unknown as { rows: { new_count: number }[] }).rows[0]?.new_count ?? 0);
    return { validIds: vIds, entityContextIdMap: ctxIdMap, newCount: nc };
  });

  if (validIds.length === 0) {
    log.debug(`markSeen: 0 valid entities out of ${entityIds.length} submitted`);
    return { newCount: 0 };
  }

  log.debug(`markSeen: ${newCount} newly seen, ${validIds.length - newCount} already seen`);
  return { newCount };
}
