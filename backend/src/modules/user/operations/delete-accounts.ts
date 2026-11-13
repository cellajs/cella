import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { clearActorActivity, deleteDanglingActors } from '#/modules/actors/actors-queries';
import { closeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { deleteProviderRowsByUsers } from '#/modules/oauth-server/oauth-server-queries';
import { findOrganizationsHeldOnlyBy } from '#/modules/organization/organization-queries';
import { applyTenantStatusChange } from '#/modules/tenants/operations/apply-tenant-status-change';
import { markTenantDeleted } from '#/modules/tenants/operations/mark-tenant-deleted';
import { deleteUsersByIds } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

interface DeleteAccountsOpts {
  userIds: string[];
  /** Who deletes them: the account's owner, a system admin, or null for the removal sweep. */
  by: ActorId | null;
  /** Also delete the actor rows: for accounts that credit nothing any more, such as a removed demo's. */
  dropActors?: boolean;
}

/** Marks deleted the tenants of the organizations no one would be left to manage, as deleting each organization does. */
async function deleteOrganizationsHeldOnlyBy(ctx: DbContext, { userIds, by }: { userIds: string[]; by: ActorId }) {
  const organizations = await findOrganizationsHeldOnlyBy(ctx, { userIds });
  for (const { tenantId } of organizations) await markTenantDeleted(ctx, { tenantId, by });
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
  const deleted = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const organizations = by ? await deleteOrganizationsHeldOnlyBy(txCtx, { userIds, by }) : [];
    if (dropActors) {
      // The user rows cascade from their actor rows.
      await deleteDanglingActors(txCtx, { ids: userIds });
    } else {
      await deleteUsersByIds(txCtx, { ids: userIds });
      await clearActorActivity(txCtx, { ids: userIds });
    }
    await deleteProviderRowsByUsers(txCtx, { userIds });
    return organizations;
  });

  for (const { tenantId } of deleted) await applyTenantStatusChange(ctx, tenantId);
  if (deleted.length > 0) log.info('Organizations deleted with their last accounts', { ids: deleted.map(({ id }) => id) });

  // The delete took the session rows along: the cache drop and the stream close follow its commit.
  for (const userId of userIds) closeSessions(userId, 'all', 'user_deleted');
}
