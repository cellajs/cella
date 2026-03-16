/**
 * Tenant handlers for system admin operations.
 *
 * Tenants are system-level resources for RLS isolation.
 * All operations require system admin access and bypass RLS.
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { and, asc, count, desc, eq, ilike, ne, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { domainsTable } from '#/db/schema/domains';
import { tenantsTable } from '#/db/schema/tenants';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import { prepareStringForILikeFilter } from '#/utils/sql';
import tenantRoutes from './tenants-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

const tenantHandlers = app
  /**
   * Get paginated list of tenants.
   */
  .openapi(tenantRoutes.getTenants, async (ctx) => {
    const db = ctx.var.db;
    const { q, status, limit, offset, sort, order } = ctx.req.valid('query');

    // Build where conditions — always exclude the public tenant from listing
    const conditions = [ne(tenantsTable.id, appConfig.publicTenant.id)];
    if (q) {
      const searchQuery = prepareStringForILikeFilter(q);
      conditions.push(ilike(tenantsTable.name, searchQuery));
    }
    if (status) {
      conditions.push(eq(tenantsTable.status, status));
    }

    const whereClause = and(...conditions);

    // Get order column
    const orderColumn = sort === 'name' ? tenantsTable.name : tenantsTable.createdAt;
    const orderDirection = order === 'asc' ? asc : desc;

    // Domains count subquery
    const domainsCountSq = db
      .select({ tenantId: domainsTable.tenantId, count: count().as('domains_count') })
      .from(domainsTable)
      .groupBy(domainsTable.tenantId)
      .as('domains_count_sq');

    // Execute queries in parallel
    const [tenants, [{ total }]] = await Promise.all([
      db
        .select({
          id: tenantsTable.id,
          name: tenantsTable.name,
          status: tenantsTable.status,
          restrictions: tenantsTable.restrictions,
          createdBy: tenantsTable.createdBy,
          subscriptionId: tenantsTable.subscriptionId,
          subscriptionStatus: tenantsTable.subscriptionStatus,
          subscriptionPlan: tenantsTable.subscriptionPlan,
          subscriptionData: tenantsTable.subscriptionData,
          domainsCount: sql<number>`coalesce(${domainsCountSq.count}, 0)`.mapWith(Number),
          createdAt: tenantsTable.createdAt,
          updatedAt: tenantsTable.updatedAt,
        })
        .from(tenantsTable)
        .leftJoin(domainsCountSq, eq(tenantsTable.id, domainsCountSq.tenantId))
        .where(whereClause)
        .orderBy(orderDirection(orderColumn))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(tenantsTable).where(whereClause),
    ]);

    return ctx.json({ items: tenants, total });
  })

  /**
   * Create a new tenant.
   */
  .openapi(tenantRoutes.createTenant, async (ctx) => {
    const db = ctx.var.db;
    const { name, status } = ctx.req.valid('json');
    const user = ctx.var.user;

    const tenant = await createTenantForUser(db, {
      name,
      createdBy: user.id,
      userEmail: user.email,
    });

    // Apply status override if provided (createTenantForUser defaults to 'active')
    if (status && status !== 'active') {
      const [updated] = await db
        .update(tenantsTable)
        .set({ status: status as typeof tenantsTable.$inferInsert.status })
        .where(eq(tenantsTable.id, tenant.id))
        .returning();
      const [{ domainsCount }] = await db
        .select({ domainsCount: count() })
        .from(domainsTable)
        .where(eq(domainsTable.tenantId, tenant.id));
      return ctx.json({ ...updated, domainsCount });
    }

    const [{ domainsCount }] = await db
      .select({ domainsCount: count() })
      .from(domainsTable)
      .where(eq(domainsTable.tenantId, tenant.id));
    return ctx.json({ ...tenant, domainsCount });
  })

  /**
   * Update a tenant.
   */
  .openapi(tenantRoutes.updateTenant, async (ctx) => {
    const db = ctx.var.db;
    const { tenantId } = ctx.req.valid('param');
    const updates = ctx.req.valid('json');
    const user = ctx.var.user;

    // Check tenant exists
    const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

    if (!existing) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    const { restrictions: restrictionsUpdate, ...otherUpdates } = updates;

    // Deep-merge restrictions so partial updates don't clobber existing values
    const mergedRestrictions = restrictionsUpdate
      ? {
          quotas: { ...existing.restrictions.quotas, ...restrictionsUpdate.quotas },
          rateLimits: { ...existing.restrictions.rateLimits, ...restrictionsUpdate.rateLimits },
        }
      : undefined;

    const [tenant] = await db
      .update(tenantsTable)
      .set({
        ...otherUpdates,
        ...(mergedRestrictions ? { restrictions: mergedRestrictions } : {}),
        updatedAt: new Date().toISOString(),
      } as typeof tenantsTable.$inferInsert)
      .where(eq(tenantsTable.id, tenantId))
      .returning();

    logEvent('info', 'Tenant updated', { tenantId, updates, updatedBy: user.id });

    const [{ domainsCount }] = await db
      .select({ domainsCount: count() })
      .from(domainsTable)
      .where(eq(domainsTable.tenantId, tenantId));
    return ctx.json({ ...tenant, domainsCount });
  });

export default tenantHandlers;
