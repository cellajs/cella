import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { seenByTable } from '#/db/schema/seen-by';
import { seenCountsTable } from '#/db/schema/seen-counts';
import type { Env } from '#/lib/context';
import seenRoutes from '#/modules/seen/seen-routes';
import { entityTables } from '#/table-config';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';

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

    // Only org-scoped product entity types are trackable
    if (!(orgScopedProductEntityTypes as readonly string[]).includes(entityType)) {
      return ctx.json({ newCount: 0 }, 200);
    }

    // Get entity table to verify entity IDs exist and are within 90-day window
    const entityTable = entityTables[entityType as keyof typeof entityTables];
    if (!entityTable) {
      return ctx.json({ newCount: 0 }, 200);
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Filter to only entities that exist, belong to this org, and are within 90-day window
    const validEntities = await tenantDb
      .select({ id: entityTable.id, createdAt: (entityTable as any).createdAt as typeof entityTable.id })
      .from(entityTable)
      .where(
        and(
          inArray(entityTable.id, entityIds),
          eq((entityTable as any).organizationId, organization.id),
          gte((entityTable as any).createdAt, ninetyDaysAgo),
        ),
      );

    const validIds = validEntities.map((e) => e.id);
    const entityCreatedAtMap = new Map(validEntities.map((e) => [e.id, e.createdAt]));
    if (validIds.length === 0) {
      return ctx.json({ newCount: 0 }, 200);
    }

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

    return ctx.json({ newCount }, 200);
  });

export default seenRouteHandlers;
