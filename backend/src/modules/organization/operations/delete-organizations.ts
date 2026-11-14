import type { ActorContext } from '#/core/context';
import { applyTenantStatusChange } from '#/modules/tenants/operations/apply-tenant-status-change';
import { markTenantDeleted } from '#/modules/tenants/operations/mark-tenant-deleted';
import { splitByPermission } from '#/permissions/split-by-permission';
import { log } from '#/utils/logger';

/**
 * Deletes organizations by marking their tenant deleted (one organization per tenant, `markTenantDeleted`): every
 * member loses access, in another process once its guard caches expire.
 */
export async function deleteOrganizationsOp(ctx: ActorContext, ids: string[]) {
  const { actor, tenantId } = ctx.var;
  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'organization', ids);

  if (allowedIds.length > 0) {
    await markTenantDeleted(ctx, { tenantId, by: actor.id });
    await applyTenantStatusChange(ctx, tenantId);
  }

  log.info('Organizations deleted', { count: allowedIds.length, ids: allowedIds });

  return { results: [], rejectedIds };
}
