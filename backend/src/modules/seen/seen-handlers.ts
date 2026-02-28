import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { SeenTrackedEntityType } from 'shared';
import { appConfig, hierarchy } from 'shared';
import { baseDb } from '#/db/db';
import { contextCountersTable } from '#/db/schema/context-counters';
import { seenByTable } from '#/db/schema/seen-by';
import { seenCountsTable } from '#/db/schema/seen-counts';
import type { Env } from '#/lib/context';
import seenRoutes from '#/modules/seen/seen-routes';
import { entityTables, type OrgScopedEntityTable } from '#/table-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

/** Product entity types tracked for seen/unseen — configured in appConfig.seenTrackedEntityTypes */
const trackedEntityTypes = appConfig.seenTrackedEntityTypes;
const trackedEntityTypeSet = new Set<string>(trackedEntityTypes);

/** Type guard: narrows a product entity type to a seen-tracked entity type */
function isTrackedEntityType(entityType: string): entityType is SeenTrackedEntityType {
  return trackedEntityTypeSet.has(entityType);
}

/** Context types that group unseen counts (derived from hierarchy parents of tracked types) */
const groupingContextTypes = new Set(trackedEntityTypes.map((t) => hierarchy.getParent(t)).filter(Boolean));

const app = new OpenAPIHono<Env>({ defaultHook });

const seenRouteHandlers = app
  /**
   * Mark entities as seen (batch)
   *
   * 1. Validate entity type is tracked + org-scoped product type
   * 2. Filter entity IDs to those that exist + belong to this org
   * 3. Derive contextId (parent context, e.g. projectId) per entity
   * 4. INSERT ... ON CONFLICT DO NOTHING RETURNING to dedup
   * 5. UPSERT seenCounts for newly seen entities
   */
  .openapi(seenRoutes.markSeen, async (ctx) => {
    const { entityIds, entityType } = ctx.req.valid('json');
    const user = ctx.var.user;
    const organization = ctx.var.organization;
    const tenantDb = ctx.var.db;

    logEvent(
      'debug',
      `markSeen: ${entityType} x${entityIds.length} for org ${organization.id.slice(0, 8)} by ${user.id.slice(0, 8)}`,
    );

    // Only configured tracked entity types are accepted
    if (!isTrackedEntityType(entityType)) {
      logEvent('debug', `markSeen: skipping non-tracked type "${entityType}"`);
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

    // Filter to only entities that exist and belong to this org
    const validEntities: { id: string; contextId: string }[] = await tenantDb
      .select({ id: orgTable.id, contextId: contextIdColumn })
      .from(entityTable)
      .where(and(inArray(orgTable.id, entityIds), eq(orgTable.organizationId, organization.id)));

    const validIds = validEntities.map((e) => e.id);

    const entityContextIdMap = new Map(validEntities.map((e) => [e.id, e.contextId]));
    if (validIds.length === 0) {
      logEvent('debug', `markSeen: 0 valid entities out of ${entityIds.length} submitted`);
      return ctx.json({ newCount: 0 }, 200);
    }

    logEvent('debug', `markSeen: ${validIds.length}/${entityIds.length} valid entities`);

    // Insert seenBy records — ON CONFLICT DO NOTHING deduplicates
    const insertedRows = await tenantDb
      .insert(seenByTable)
      .values(
        validIds.map((entityId) => ({
          userId: user.id,
          entityId,
          entityType,
          contextId: entityContextIdMap.get(entityId) ?? organization.id,
          organizationId: organization.id,
          tenantId: organization.tenantId,
        })),
      )
      .onConflictDoNothing({ target: [seenByTable.userId, seenByTable.entityId] })
      .returning({ entityId: seenByTable.entityId });

    const newCount = insertedRows.length;

    // Update view counts only for newly seen entities
    if (newCount > 0) {
      const newEntityIds = insertedRows.map((r) => r.entityId);

      // Batch UPSERT: increment viewCount for each newly-seen entity
      await tenantDb
        .insert(seenCountsTable)
        .values(
          newEntityIds.map((entityId) => ({
            entityId,
            entityType,
            viewCount: 1,
            updatedAt: getIsoDate(),
          })),
        )
        .onConflictDoUpdate({
          target: seenCountsTable.entityId,
          set: {
            viewCount: sql`${seenCountsTable.viewCount} + 1`,
            updatedAt: sql`now()`,
          },
        });
    }

    logEvent('debug', `markSeen: ${newCount} newly seen, ${validIds.length - newCount} already seen`);
    return ctx.json({ newCount }, 200);
  });

export default seenRouteHandlers;

/**
 * Unseen counts for current user.
 *
 * Computes unseen = total (context_counters) − seen (seen_by) per context.
 * No entity table scans, no RLS context, no per-tenant loop.
 * Both context_counters and seen_by have no RLS — queried directly via baseDb.
 */
const unseenApp = new OpenAPIHono<Env>({ defaultHook });

export const unseenRouteHandlers = unseenApp.openapi(seenRoutes.getUnseenCounts, async (ctx) => {
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
    const idKey = appConfig.entityIdColumnKeys[m.contextType] as keyof typeof m;
    const id = m[idKey];
    if (typeof id === 'string') contextIds.push(id);
  }

  // Fallback: if any tracked type has no parent, group by org → collect org IDs
  const needsOrgFallback = trackedEntityTypes.some((t) => !hierarchy.getParent(t));
  if (needsOrgFallback) {
    const orgIds = new Set(memberships.map((m) => m.organizationId));
    for (const id of orgIds) contextIds.push(id);
  }

  if (contextIds.length === 0) {
    return ctx.json({}, 200);
  }

  const uniqueContextIds = [...new Set(contextIds)];

  // 1. Total entity counts from context_counters (no RLS)
  const countRows = await baseDb
    .select({
      contextKey: contextCountersTable.contextKey,
      counts: contextCountersTable.counts,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, uniqueContextIds));

  // 2. User's seen counts from seen_by grouped by contextId + entityType (no RLS)
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

  for (const row of countRows) {
    for (const trackedType of trackedEntityTypes) {
      const total = (row.counts as Record<string, number>)?.[`e:${trackedType}`] ?? 0;
      if (total <= 0) continue;

      const seen = seenByContext.get(row.contextKey)?.get(trackedType) ?? 0;
      const unseen = Math.max(0, total - seen);
      if (unseen > 0) {
        if (!results[row.contextKey]) results[row.contextKey] = {};
        results[row.contextKey][trackedType] = unseen;
      }
    }
  }

  return ctx.json(results, 200);
});
