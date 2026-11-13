import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { clearActorActivity, deleteDanglingActors } from '#/modules/actors/actors-queries';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { deleteProviderRowsByUsers } from '#/modules/oauth-server/oauth-server-queries';
import { findOrganizationsHeldOnlyBy } from '#/modules/organization/organization-queries';
import { applyTenantStatusChange } from '#/modules/tenants/operations/apply-tenant-status-change';
import { updateTenant } from '#/modules/tenants/tenants-queries';
import { deleteUsersByIds } from '#/modules/user/user-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

interface DeleteAccountsOpts {
  userIds: string[];
  /** Who deletes them: the account's owner, a system admin, or null for the removal sweep. */
  by: ActorId | null;
  /** Also delete the actor rows: for accounts that credit nothing any more, such as a removed demo's. */
  dropActors?: boolean;
}

/** Archives the tenants of the organizations no one would be left to manage, as deleting each organization does. */
async function archiveOrganizationsHeldOnlyBy(ctx: DbContext, { userIds, by }: { userIds: string[]; by: ActorId }) {
  const organizations = await findOrganizationsHeldOnlyBy(ctx, { userIds });
  const at = getIsoDate();
  for (const { tenantId } of organizations) {
    await updateTenant(ctx, { id: tenantId, values: { status: 'archived', statusChangedAt: at, ...updateStamps(by, at) } });
  }
  return organizations;
}

/**
 * Deletes accounts at their owner's or a system admin's request, or as a removed tenant's leftovers: the user rows,
 * everything the authorization server holds for them, and their sessions in every process with the streams bound to
 * them. The actor row stays as the credit on what they wrote, resolving to no one, without its activity times, unless
 * `dropActors` says nothing credits it. An organization they alone could manage, with no other member who has a proven
 * address, is deleted with them the way its admin deletes it. The writes commit together: an organization left without
 * an admin while another member could become one refuses the commit (`last_admin`) and nothing goes.
 */
export async function deleteAccounts(ctx: DbContext, { userIds, by, dropActors = false }: DeleteAccountsOpts): Promise<void> {
  const archived = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const organizations = by ? await archiveOrganizationsHeldOnlyBy(txCtx, { userIds, by }) : [];
    await deleteUsersByIds(txCtx, { ids: userIds });
    await deleteProviderRowsByUsers(txCtx, { userIds });
    if (dropActors) await deleteDanglingActors(txCtx, { ids: userIds });
    else await clearActorActivity(txCtx, { ids: userIds });
    return organizations;
  });

  for (const { id, tenantId } of archived) {
    invalidateCache.tenant(tenantId);
    invalidateCache.org(tenantId, id);
    await applyTenantStatusChange(ctx, tenantId);
  }
  if (archived.length > 0) log.info('Organizations archived with their last accounts', { ids: archived.map(({ id }) => id) });

  // After the commit: `user_deleted` stamps nothing, and the cache drop and the stream close must follow the delete.
  for (const userId of userIds) await revokeSessions(ctx, { userId, all: true, reason: 'user_deleted', by });
}
