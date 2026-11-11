import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { applyTenantStatusChange } from '#/modules/tenants/operations/apply-tenant-status-change';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant, updateTenant } from '#/modules/tenants/tenants-queries';
import type { updateTenantBodySchema } from '#/modules/tenants/tenants-schema';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { applyMergePatch } from '#/utils/merge-patch';

type UpdateTenantInput = z.infer<typeof updateTenantBodySchema>;

/**
 * Updates a tenant's name, kind, status, sign-in policy or restrictions; a restrictions update is a
 * merge patch of the stored ones. A status change also moves the members' bindings and ends their streams. The kind
 * moves between `live` and `test` only: a demo is made by `createDemo` alone and stays one.
 * @throws AppError 403 `restrict_by_tenant_kind` for a kind change to or from `demo`.
 * @throws AppError 404 `not_found` for an unknown tenant.
 */
export async function updateTenantOp(ctx: UserContext, tenantId: string, updates: UpdateTenantInput) {
  const { restrictions: restrictionsUpdate, ...otherUpdates } = updates;

  const { existing, updated, statusChanged } = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    // Locked: the restrictions merge starts from this row, so no other write may commit between the read and the update.
    const existing = await findTenant(txCtx, { where: eq(tenantsTable.id, tenantId), forUpdate: true });
    if (!existing) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });

    const kindChanged = otherUpdates.kind !== undefined && otherUpdates.kind !== existing.kind;
    if (kindChanged && (existing.kind === 'demo' || otherUpdates.kind === 'demo')) {
      throw new AppError(403, 'restrict_by_tenant_kind', 'warn', { meta: { resource: 'kind', kind: existing.kind } });
    }

    const statusChanged = otherUpdates.status !== undefined && otherUpdates.status !== existing.status;
    const values = {
      ...otherUpdates,
      // `existing` holds every field, so the stored shape is whole but for the keys a `null` removed.
      ...(restrictionsUpdate ? { restrictions: applyMergePatch(existing.restrictions, restrictionsUpdate) } : {}),
      ...(statusChanged ? { statusChangedAt: getIsoDate() } : {}),
      ...updateStamps(ctx.var.actor.id),
    };
    return { existing, updated: await updateTenant(txCtx, { id: tenantId, values }), statusChanged };
  });

  invalidateCache.tenant(tenantId);
  if (statusChanged) await applyTenantStatusChange(ctx, tenantId);

  log.info('Tenant updated', { tenantId, updates });

  // An update leaves the tenant's organization as it was.
  return withActorRef(ctx, { ...existing, ...updated, restrictions: normalizeRestrictions(updated.restrictions) });
}
