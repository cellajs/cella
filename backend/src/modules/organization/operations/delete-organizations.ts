import type { ActorContext } from '#/core/context';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { applyTenantStatusChange } from '#/modules/tenants/operations/apply-tenant-status-change';
import { updateTenant } from '#/modules/tenants/tenants-queries';
import { splitByPermission } from '#/permissions/split-by-permission';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/**
 * Deletes organizations by archiving their tenant (one organization per tenant): every member loses access (in another
 * process once its guard caches expire), and the archived-tenant sweep removes the organization with everything in it
 * `archivedTenantDays` later. Until then a system admin restores it by setting the tenant active.
 */
export async function deleteOrganizationsOp(ctx: ActorContext, ids: string[]) {
  const { actor, tenantId } = ctx.var;
  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'organization', ids);

  if (allowedIds.length > 0) {
    const at = getIsoDate();
    await updateTenant(ctx, { id: tenantId, values: { status: 'archived', statusChangedAt: at, ...updateStamps(actor.id, at) } });
    invalidateCache.tenant(tenantId);
    for (const id of allowedIds) invalidateCache.org(tenantId, id);
    await applyTenantStatusChange(ctx, tenantId);
  }

  log.info('Organizations archived', { count: allowedIds.length, ids: allowedIds });

  return { data: [], rejectedIds };
}
