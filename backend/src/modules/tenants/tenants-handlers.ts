/**
 * Tenant handlers for system admin operations.
 *
 * Tenants are system-level resources for RLS isolation.
 * All operations require system admin access and bypass RLS.
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { eq, ilike, ne } from 'drizzle-orm';
import { appConfig } from 'shared';
import { tenantsTable } from '#/db/schema/tenants';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { countDomainsByTenant, findTenantById, getTenantsList, updateTenant } from '#/modules/tenants/tenants-queries';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import { prepareStringForILikeFilter } from '#/utils/sql';
import tenantRoutes from './tenants-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Get paginated list of tenants.
 */
app.openapi(tenantRoutes.getTenants, async (ctx) => {
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

  const { items, total } = await getTenantsList(db, { filters: conditions, sort, order, limit, offset });

  return ctx.json({ items, total });
});

/**
 * Create a new tenant.
 */
app.openapi(tenantRoutes.createTenant, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  const { name, status } = ctx.req.valid('json');

  const tenant = await createTenantForUser(
    db,
    {
      name,
      createdBy: user.id,
      userEmail: user.email,
    },
    ctx,
  );

  // Apply status override if provided (createTenantForUser defaults to 'active')
  if (status && status !== 'active') {
    const updated = await updateTenant(db, {
      tenantId: tenant.id,
      values: { status: status as typeof tenantsTable.$inferInsert.status },
    });
    invalidateCache.tenant(tenant.id);
    const domainsCount = await countDomainsByTenant(db, { tenantId: tenant.id });
    return ctx.json({ ...updated, domainsCount });
  }

  const domainsCount = await countDomainsByTenant(db, { tenantId: tenant.id });
  return ctx.json({ ...tenant, domainsCount });
});

/**
 * Update a tenant.
 */
app.openapi(tenantRoutes.updateTenant, async (ctx) => {
  const db = ctx.var.db;

  const { tenantId } = ctx.req.valid('param');
  const updates = ctx.req.valid('json');

  // Check tenant exists
  const existing = await findTenantById(db, { tenantId });
  if (!existing) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });

  const { restrictions: restrictionsUpdate, ...otherUpdates } = updates;

  // Deep-merge restrictions so partial updates don't clobber existing values
  const mergedRestrictions = restrictionsUpdate
    ? {
        quotas: { ...existing.restrictions.quotas, ...restrictionsUpdate.quotas },
        rateLimits: { ...existing.restrictions.rateLimits, ...restrictionsUpdate.rateLimits },
      }
    : undefined;

  const values = {
    ...otherUpdates,
    ...(mergedRestrictions ? { restrictions: mergedRestrictions } : {}),
    updatedAt: new Date().toISOString(),
  };
  const tenant = await updateTenant(db, { tenantId, values });

  invalidateCache.tenant(tenantId);

  logEvent(ctx, 'info', 'Tenant updated', { tenantId, updates });

  const domainsCount = await countDomainsByTenant(db, { tenantId });
  return ctx.json({ ...tenant, domainsCount });
});

export { tenantTag } from '#/modules/tenants/tenants-module';
export const tenantHandlers = app;
