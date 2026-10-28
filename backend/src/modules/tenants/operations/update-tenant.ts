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

/**
 * Updates a tenant's name, status, subscription, sign-in policy or restrictions; a restrictions update is merged over
 * the stored ones. A status change also moves the members' bindings and ends their streams.
 * @throws AppError 404 `not_found` for an unknown tenant.
 */
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
    ...updateStamps(ctx.var.actor.id),
  };
  const updated = await updateTenant(ctx, { id: tenantId, values });

  invalidateCache.tenant(tenantId);
  if (statusChanged) await applyTenantStatusChange(ctx, tenantId);

  log.info('Tenant updated', { tenantId, updates });

  // An update leaves the tenant's organization as it was.
  return withActorRef(ctx, { ...existing, ...updated, restrictions: normalizeRestrictions(updated.restrictions) });
}
