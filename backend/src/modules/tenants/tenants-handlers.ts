/**
 * Tenant handlers for system admin operations.
 *
 * Tenants are system-level resources for RLS isolation.
 * All operations require system admin access and bypass RLS.
 *
 * @see info/RLS.md for architecture documentation
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '#/db/db';
import { tenantsTable } from '#/db/schema/tenants';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { SYSTEM_TENANT_ID } from '../../../scripts/seeds/fixtures';
import tenantRoutes from './tenants-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

const tenantHandlers = app
  /**
   * Get paginated list of tenants.
   */
  .openapi(tenantRoutes.getTenants, async (ctx) => {
    const { q, status, limit, offset, sort, order } = ctx.req.valid('query');
    const limitNum = Math.min(Number(limit) || 50, 100);
    const offsetNum = Number(offset) || 0;

    // Build where conditions
    const conditions = [];
    if (q) {
      const searchQuery = prepareStringForILikeFilter(q);
      conditions.push(ilike(tenantsTable.name, searchQuery));
    }
    if (status) {
      conditions.push(eq(tenantsTable.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get order column
    const orderColumn = sort === 'name' ? tenantsTable.name : tenantsTable.createdAt;
    const orderDirection = order === 'asc' ? asc : desc;

    // Execute queries in parallel
    const [tenants, [{ total }]] = await Promise.all([
      db
        .select()
        .from(tenantsTable)
        .where(whereClause)
        .orderBy(orderDirection(orderColumn))
        .limit(limitNum)
        .offset(offsetNum),
      db.select({ total: count() }).from(tenantsTable).where(whereClause),
    ]);

    return ctx.json({ items: tenants, total });
  })

  /**
   * Get a single tenant by ID.
   */
  .openapi(tenantRoutes.getTenantById, async (ctx) => {
    const { tenantId } = ctx.req.valid('param');

    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

    if (!tenant) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    return ctx.json(tenant);
  })

  /**
   * Create a new tenant.
   */
  .openapi(tenantRoutes.createTenant, async (ctx) => {
    const { name, status } = ctx.req.valid('json');
    const user = ctx.var.user;

    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        name,
        status: status || 'active',
      })
      .returning();

    logEvent('info', 'Tenant created', { tenantId: tenant.id, name, createdBy: user.id });

    return ctx.json(tenant);
  })

  /**
   * Update a tenant.
   */
  .openapi(tenantRoutes.updateTenant, async (ctx) => {
    const { tenantId } = ctx.req.valid('param');
    const updates = ctx.req.valid('json');
    const user = ctx.var.user;

    // Check tenant exists
    const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

    if (!existing) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    const [tenant] = await db
      .update(tenantsTable)
      .set({
        ...updates,
        modifiedAt: new Date().toISOString(),
      })
      .where(eq(tenantsTable.id, tenantId))
      .returning();

    logEvent('info', 'Tenant updated', { tenantId, updates, updatedBy: user.id });

    return ctx.json(tenant);
  })

  /**
   * Archive a tenant (soft delete).
   */
  .openapi(tenantRoutes.archiveTenant, async (ctx) => {
    const { tenantId } = ctx.req.valid('param');
    const user = ctx.var.user;

    // Protect system tenant from archival
    if (tenantId === SYSTEM_TENANT_ID) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'Cannot archive system tenant' } });
    }

    // Check tenant exists
    const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

    if (!existing) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    if (existing.status === 'archived') {
      throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'Tenant is already archived' } });
    }

    await db
      .update(tenantsTable)
      .set({
        status: 'archived',
        modifiedAt: new Date().toISOString(),
      })
      .where(eq(tenantsTable.id, tenantId));

    logEvent('info', 'Tenant archived', { tenantId, archivedBy: user.id });

    return ctx.json({ success: true });
  });

export default tenantHandlers;
