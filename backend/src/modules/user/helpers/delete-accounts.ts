import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { deleteConsentsOfUsers } from '#/modules/oauth-server/oauth-server-queries';
import { deleteUsersByIds } from '#/modules/system/system-queries';

interface DeleteAccountsOpts {
  userIds: string[];
  /** Who deletes them: the account's owner, or a system admin. */
  by: ActorId;
}

/**
 * Deletes accounts at their owner's or a system admin's request: the user rows, everything the authorization server
 * holds for them, and their sessions in every process with the streams bound to them. An organization left without an
 * admin refuses the delete (`last_admin`) before anything else goes.
 * @param ctx - Any context with a database.
 * @param opts - The users to delete and who deletes them.
 */
export async function deleteAccounts(ctx: DbContext, { userIds, by }: DeleteAccountsOpts): Promise<void> {
  // CASCADE SET NULL on createdBy/updatedBy propagates to product entities.
  await deleteUsersByIds(ctx, { ids: userIds });
  await deleteConsentsOfUsers(ctx, { userIds });
  for (const userId of userIds) await endSessions(ctx, { userId, all: true, reason: 'user_deleted', by });
}
