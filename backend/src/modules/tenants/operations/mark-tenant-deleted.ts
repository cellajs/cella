import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { updateTenant } from '#/modules/tenants/tenants-queries';

/**
 * Marks a tenant deleted, the way its organization is deleted: its members lose access, a system admin can restore it,
 * and the removal sweep removes it with everything in it `deletedTenantDays` later. Runs in the caller's transaction,
 * which calls `applyTenantStatusChange` after its commit.
 */
export async function markTenantDeleted(ctx: DbContext, { tenantId, by }: { tenantId: string; by: ActorId }): Promise<void> {
  await updateTenant(ctx, { id: tenantId, values: { status: 'deleted' }, by });
}
