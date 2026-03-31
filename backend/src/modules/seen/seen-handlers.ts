import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getTableColumns, gt, inArray, sql } from 'drizzle-orm';
import type { SeenTrackedEntityType } from 'shared';
import { appConfig, hierarchy } from 'shared';
import { nanoid } from 'shared/nanoid';
import { baseDb } from '#/db/db';
import { contextCountersTable } from '#/db/schema/context-counters';
import { seenByTable } from '#/db/schema/seen-by';
import { tenantContext } from '#/db/tenant-context';
import type { Env } from '#/lib/context';
import seenRoutes from '#/modules/seen/seen-routes';
import { entityTables, type OrgScopedEntityTable } from '#/table-config';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

/** Product entity types tracked for seen/unseen — configured in appConfig.seenTrackedEntityTypes */
const trackedEntityTypes = appConfig.seenTrackedEntityTypes;
const trackedEntityTypeSet = new Set<string>(trackedEntityTypes);

/** 90-day rolling window — entities older than this are ignored for seen/unseen tracking */
const seenWindowMs = 90 * 24 * 60 * 60 * 1000;

/** Type guard: narrows a product entity type to a seen-tracked entity type */
function isTrackedEntityType(entityType: string): entityType is SeenTrackedEntityType {
  return trackedEntityTypeSet.has(entityType);
}

/** Context types that group unseen counts (derived from hierarchy parents of tracked types) */
const groupingContextTypes = new Set(trackedEntityTypes.map((t) => hierarchy.getParent(t)).filter(Boolean));

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Mark entities as seen (batch)
 *
 * 1. Validate entity type is tracked + org-scoped product type
 * 2. Filter entity IDs to those that exist + belong to this org
 * 3. Derive contextId (parent context, e.g. projectId) per entity
 * 4. INSERT ... ON CONFLICT DO NOTHING RETURNING to dedup
 * 5. UPSERT seenCounts for newly seen entities
 */
app.openapi(seenRoutes.markSeen, async (ctx) => {
  const user = ctx.var.user;
  const organization = ctx.var.organization;

  const { entityIds, entityType } = ctx.req.valid('json');

  logEvent(
    ctx,
    'debug',
    `markSeen: ${entityType} x${entityIds.length} for org ${organization.id.slice(0, 8)} by ${user.id.slice(0, 8)}`,
  );

  // Only configured tracked entity types are accepted
  if (!isTrackedEntityType(entityType)) {
    logEvent(ctx, 'debug', `markSeen: skipping non-tracked type "${entityType}"`);
    return ctx.json({ newCount: 0 }, 200);
  }

  // After narrowing, entityType is SeenTrackedEntityType — a valid key of entityTables
  const entityTable = entityTables[entityType];

  // Narrow to org-scoped table shape (all org-scoped product tables have these columns)
  const orgTable = entityTable as OrgScopedEntityTable;
  const columns = getTableColumns(entityTable);

  // Derive context ID column from hierarchy parent (e.g., task → project → 'projectId')
  const parentType = hierarchy.getParent(entityType);
  const contextIdColumnKey = parentType ? appConfig.entityIdColumnKeys[parentType] : 'organizationId';
  const contextIdColumn =
    (columns as Record<string, typeof orgTable.organizationId>)[contextIdColumnKey] ?? orgTable.organizationId;

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

    logEvent(ctx, 'debug', `markSeen: ${vIds.length}/${entityIds.length} valid entities`);

    // Single-roundtrip CTE that:
    // 1. Bulk-inserts seen_by rows, skipping duplicates (ON CONFLICT DO NOTHING)
    // 2. Upserts product_counters only for newly inserted rows (increments view_count)
    // 3. Returns the count of genuinely new seen records
    const values = sql.join(
      vIds.map(
        (entityId) =>
          sql`(${nanoid()}, ${user.id}, ${entityId}, ${entityType}, ${ctxIdMap.get(entityId) ?? organization.id}, ${organization.id}, ${organization.tenantId}, now())`,
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
    logEvent(ctx, 'debug', `markSeen: 0 valid entities out of ${entityIds.length} submitted`);
    return ctx.json({ newCount: 0 }, 200);
  }

  logEvent(ctx, 'debug', `markSeen: ${newCount} newly seen, ${validIds.length - newCount} already seen`);
  return ctx.json({ newCount }, 200);
});

export { seenTag } from '#/modules/seen/seen-module';
export const seenHandlers = app;

/**
 * Unseen counts for current user.
 *
 * Computes unseen = total (from context_counters) − seen (from seen_by) per context.
 * Uses context_counters (no RLS) for entity totals instead of querying entity tables directly.
 * seen_by is bounded to 90 days by pg_partman pruning.
 */
const unseenApp = new OpenAPIHono<Env>({ defaultHook });

export const unseenHandlers = unseenApp.openapi(seenRoutes.getUnseenCounts, async (ctx) => {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  if (memberships.length === 0 || trackedEntityTypeSet.size === 0) {
    return ctx.json({}, 200);
  }

  // Collect context entity IDs from memberships whose contextType groups seen counts
  // e.g., project memberships → projectIds (since task's parent is project)
  const contextIds: string[] = [];
  for (const m of memberships) {
    if (!groupingContextTypes.has(m.contextType)) continue;
    contextIds.push(m.contextId);
  }

  // Fallback: if any tracked type has no parent, group by org → collect org IDs
  const needsOrgFallback = trackedEntityTypes.some((t) => !hierarchy.getParent(t));
  if (needsOrgFallback) {
    const organizationIds = new Set(memberships.map((m) => m.organizationId));
    for (const id of organizationIds) contextIds.push(id);
  }

  if (contextIds.length === 0) {
    return ctx.json({}, 200);
  }

  const uniqueContextIds = [...new Set(contextIds)];

  // 1. Total entity counts per context from context_counters (no RLS, pre-computed)
  const totalByContext = new Map<string, Map<string, number>>();

  const counterRows = await baseDb
    .select({
      contextKey: contextCountersTable.contextKey,
      counts: contextCountersTable.counts,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, uniqueContextIds));

  for (const row of counterRows) {
    for (const trackedType of trackedEntityTypes) {
      const total = row.counts[`e:${trackedType}`] ?? 0;
      if (total <= 0) continue;

      let typeMap = totalByContext.get(row.contextKey);
      if (!typeMap) {
        typeMap = new Map();
        totalByContext.set(row.contextKey, typeMap);
      }
      typeMap.set(trackedType, total);
    }
  }

  // 2. User's seen counts from seen_by grouped by contextId + entityType (no RLS)
  // seen_by is naturally bounded to 90 days by partman pruning
  const seenRows = await baseDb
    .select({
      contextId: seenByTable.contextId,
      entityType: seenByTable.entityType,
      seenCount: count(),
    })
    .from(seenByTable)
    .where(and(eq(seenByTable.userId, user.id), inArray(seenByTable.contextId, uniqueContextIds)))
    .groupBy(seenByTable.contextId, seenByTable.entityType);

  // 3. Build seen map: { [contextId]: { [entityType]: seenCount } }
  const seenByContext = new Map<string, Map<string, number>>();
  for (const row of seenRows) {
    let typeMap = seenByContext.get(row.contextId);
    if (!typeMap) {
      typeMap = new Map();
      seenByContext.set(row.contextId, typeMap);
    }
    typeMap.set(row.entityType, Number(row.seenCount));
  }

  // 4. Compute unseen = total − seen (floored at 0)
  const results: Record<string, Record<string, number>> = {};

  for (const [contextId, typeMap] of totalByContext) {
    for (const [trackedType, total] of typeMap) {
      if (total <= 0) continue;

      const seen = seenByContext.get(contextId)?.get(trackedType) ?? 0;
      const unseen = Math.max(0, total - seen);
      if (unseen > 0) {
        if (!results[contextId]) results[contextId] = {};
        results[contextId][trackedType] = unseen;
      }
    }
  }

  return ctx.json(results, 200);
});
