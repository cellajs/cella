import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { countDomainsByTenant, findTenantById, updateTenant } from '#/modules/tenants/tenants-queries';
import type { updateTenantBodySchema } from '#/modules/tenants/tenants-schema';
import { logEvent } from '#/utils/logger';

type UpdateTenantInput = z.infer<typeof updateTenantBodySchema>;

export async function updateTenantOp(ctx: AuthContext, tenantId: string, updates: UpdateTenantInput) {
  // Check tenant exists
  const existing = await findTenantById(ctx, { targetTenantId: tenantId });
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
  const tenant = await updateTenant(ctx, { targetTenantId: tenantId, values });

  invalidateCache.tenant(tenantId);

  logEvent(ctx, 'info', 'Tenant updated', { tenantId, updates });

  const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: tenantId });
  return { ...tenant, domainsCount };
}
