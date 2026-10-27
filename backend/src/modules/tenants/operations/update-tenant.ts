import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { applyTenantStatusChange } from '#/modules/tenants/operations/apply-tenant-status-change';
import { mergeRestrictions, normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant, updateTenant } from '#/modules/tenants/tenants-queries';
import type { updateTenantBodySchema } from '#/modules/tenants/tenants-schema';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type UpdateTenantInput = z.infer<typeof updateTenantBodySchema>;

export async function updateTenantOp(ctx: UserContext, tenantId: string, updates: UpdateTenantInput) {
  const existing = await findTenant(ctx, { where: eq(tenantsTable.id, tenantId) });
  if (!existing) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });

  const { restrictions: restrictionsUpdate, ...otherUpdates } = updates;

  const statusChanged = otherUpdates.status !== undefined && otherUpdates.status !== existing.status;
  const values = {
    ...otherUpdates,
    // `existing` already has every field, so a partial update stores the full shape.
    ...(restrictionsUpdate ? { restrictions: mergeRestrictions(existing.restrictions, restrictionsUpdate) } : {}),
    ...(statusChanged ? { statusChangedAt: getIsoDate() } : {}),
    ...updateStamps(ctx.var.user.id),
  };
  const updated = await updateTenant(ctx, { targetTenantId: tenantId, values });

  invalidateCache.tenant(tenantId);
  if (statusChanged) await applyTenantStatusChange(ctx, tenantId);

  log.info('Tenant updated', { tenantId, updates });

  // An update leaves the tenant's organization and connections as they were.
  return withActorRef(ctx, { ...existing, ...updated, restrictions: normalizeRestrictions(updated.restrictions) });
}
