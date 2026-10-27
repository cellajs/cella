import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { clearActorActivity } from '#/modules/actors/actors-queries';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { deleteConsentsOfUsers } from '#/modules/oauth-server/oauth-server-queries';
import { deleteUsersByIds } from '#/modules/user/user-queries';

interface DeleteAccountsOpts {
  userIds: string[];
  /** Who deletes them: the account's owner, or a system admin. */
  by: ActorId;
}

/**
 * Deletes accounts at their owner's or a system admin's request: the user rows, everything the authorization server
 * holds for them, and their sessions in every process with the streams bound to them. The actor row stays as the credit
 * on what they wrote, resolving to no one, without its activity times. The writes commit together; an organization
 * left without an admin refuses the commit (`last_admin`), so nothing goes.
 * @param ctx - Any context with a database.
 * @param opts - The users to delete and who deletes them.
 */
export async function deleteAccounts(ctx: DbContext, { userIds, by }: DeleteAccountsOpts): Promise<void> {
  await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await deleteUsersByIds(txCtx, { ids: userIds });
    await clearActorActivity(txCtx, { ids: userIds });
    await deleteConsentsOfUsers(txCtx, { userIds });
  });
  // After the commit: `user_deleted` stamps nothing, and the cache drop and the stream close must follow the delete.
  for (const userId of userIds) await revokeSessions(ctx, { userId, all: true, reason: 'user_deleted', by });
}
