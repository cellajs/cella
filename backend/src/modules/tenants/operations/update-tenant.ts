import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant, updateTenant } from '#/modules/tenants/tenants-queries';
import type { updateTenantBodySchema } from '#/modules/tenants/tenants-schema';
import { log } from '#/utils/logger';

type UpdateTenantInput = z.infer<typeof updateTenantBodySchema>;

export async function updateTenantOp(ctx: UserContext, tenantId: string, updates: UpdateTenantInput) {
  const existing = await findTenant(ctx, { where: eq(tenantsTable.id, tenantId) });
  if (!existing) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });

  const { restrictions: restrictionsUpdate, ...otherUpdates } = updates;

  // Deep-merge restrictions so partial updates don't clobber existing values; `existing` already has every field
  const current = existing.restrictions;
  const mergedRestrictions = restrictionsUpdate
    ? {
        quotas: { ...current.quotas, ...restrictionsUpdate.quotas },
        rateLimits: { ...current.rateLimits, ...restrictionsUpdate.rateLimits },
        allowUnregisteredClients: restrictionsUpdate.allowUnregisteredClients ?? current.allowUnregisteredClients,
      }
    : undefined;

  const values = {
    ...otherUpdates,
    ...(mergedRestrictions ? { restrictions: mergedRestrictions } : {}),
    updatedAt: new Date().toISOString(),
  };
  const updated = await updateTenant(ctx, { targetTenantId: tenantId, values });

  invalidateCache.tenant(tenantId);

  log.info('Tenant updated', { tenantId, updates });

  // An update leaves the tenant's organization and connections as they were.
  return { ...existing, ...updated, restrictions: normalizeRestrictions(updated.restrictions) };
}
