import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, gte, inArray, notExists, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { seenByTable } from '#/db/schema/seen-by';
import { seenCountsTable } from '#/db/schema/seen-counts';
import { setTenantRlsContext } from '#/db/tenant-context';
import type { Env } from '#/lib/context';
import seenRoutes from '#/modules/seen/seen-routes';
import { entityTables, type OrgScopedEntityTable } from '#/table-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

/** Product entity types that are org-scoped (have organizationId) */
const orgScopedProductEntityTypes = appConfig.productEntityTypes.filter(
  (t) => !(appConfig.parentlessProductEntityTypes as readonly string[]).includes(t),
);

const app = new OpenAPIHono<Env>({ defaultHook });

const seenRouteHandlers = app
  /**
   * Mark entities as seen (batch)
   *
   * 1. Validate entity type is org-scoped product type
   * 2. Filter entity IDs to those created within 90 days
   * 3. INSERT ... ON CONFLICT DO NOTHING RETURNING to dedup
   * 4. UPSERT seenCounts for newly seen entities
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

    // Only org-scoped product entity types are trackable
    if (!(orgScopedProductEntityTypes as readonly string[]).includes(entityType)) {
      logEvent('debug', `markSeen: skipping non-org-scoped type "${entityType}"`);
      return ctx.json({ newCount: 0 }, 200);
    }

    // Get entity table to verify entity IDs exist and are within 90-day window
    const entityTable = entityTables[entityType as keyof typeof entityTables];
    if (!entityTable) {
      return ctx.json({ newCount: 0 }, 200);
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Narrow to org-scoped table shape (all org-scoped product tables have these columns)
    const orgTable = entityTable as OrgScopedEntityTable;

    // Filter to only entities that exist, belong to this org, and are within 90-day window
    const validEntities: { id: string; createdAt: string }[] = await tenantDb
      .select({ id: orgTable.id, createdAt: orgTable.createdAt })
      .from(entityTable)
      .where(
        and(
          inArray(orgTable.id, entityIds),
          eq(orgTable.organizationId, organization.id),
          gte(orgTable.createdAt, ninetyDaysAgo),
        ),
      );

    const validIds = validEntities.map((e) => e.id);
    const entityCreatedAtMap = new Map(validEntities.map((e) => [e.id, e.createdAt]));
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
            entityCreatedAt: entityCreatedAtMap.get(entityId)!,
            viewCount: 1,
            updatedAt: getIsoDate(),
          })),
        )
        .onConflictDoUpdate({
          target: [seenCountsTable.entityId, seenCountsTable.entityCreatedAt],
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
 */
const unseenApp = new OpenAPIHono<Env>({ defaultHook });

export const unseenRouteHandlers = unseenApp.openapi(seenRoutes.getUnseenCounts, async (ctx) => {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  // Org-scoped product entity types (exclude parentless types like pages)
  const orgScopedTypes = appConfig.productEntityTypes.filter(
    (t) => !(appConfig.parentlessProductEntityTypes as readonly string[]).includes(t),
  );

  // Group org IDs by tenant
  const orgsByTenant = new Map<string, string[]>();
  for (const m of memberships) {
    const orgs = orgsByTenant.get(m.tenantId) ?? [];
    orgs.push(m.organizationId);
    orgsByTenant.set(m.tenantId, orgs);
  }

  if (orgsByTenant.size === 0 || orgScopedTypes.length === 0) {
    return ctx.json({}, 200);
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Shape: { [contextEntityId]: { [productEntityType]: count } }
  const results: Record<string, Record<string, number>> = {};

  // Query per tenant to satisfy entity table RLS policies
  for (const [tenantId, tenantOrgIds] of orgsByTenant) {
    const uniqueOrgIds = [...new Set(tenantOrgIds)];

    await setTenantRlsContext({ tenantId, userId: user.id }, async (tx) => {
      for (const entityType of orgScopedTypes) {
        const entityTable = entityTables[entityType as keyof typeof entityTables];
        if (!entityTable || !('organizationId' in entityTable)) continue;

        const orgTable = entityTable as OrgScopedEntityTable;

        const rows: { organizationId: string; unseenCount: number }[] = await tx
          .select({
            organizationId: orgTable.organizationId,
            unseenCount: count(),
          })
          .from(entityTable)
          .where(
            and(
              inArray(orgTable.organizationId, uniqueOrgIds),
              gte(orgTable.createdAt, ninetyDaysAgo),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(seenByTable)
                  .where(and(eq(seenByTable.entityId, orgTable.id), eq(seenByTable.userId, user.id))),
              ),
            ),
          )
          .groupBy(orgTable.organizationId);

        for (const row of rows) {
          if (row.unseenCount > 0) {
            if (!results[row.organizationId]) results[row.organizationId] = {};
            results[row.organizationId][entityType] = row.unseenCount;
          }
        }
      }
    });
  }

  return ctx.json(results, 200);
});
