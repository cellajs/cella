import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { EmailProof } from '#/modules/user/emails-db';
import { claimEmailForUser } from '#/modules/user/operations/claim-email';
import { updateEmailProof, upsertProvenEmail } from '#/modules/user/user-queries';

interface EmailProofOpts {
  userId: string;
  email: string;
  via: EmailProof;
}

/**
 * Records an inbox proof on the user's address and claims the invitations waiting for it. Returns false when the user
 * has no row for the address: the caller proved ownership of an address the account does not hold, which is drift to
 * surface, never to ignore.
 */
export const markEmailVerified = async (ctx: DbContext, { userId, email, via }: EmailProofOpts): Promise<boolean> => {
  const stamped = await updateEmailProof(ctx, { userId, email, via });
  if (!stamped) return false;

  // The inbox is proven, so the invitations waiting for this address are this user's. Idempotent, one cheap lookup.
  await claimEmailForUser(ctx, { userId, email });
  return true;
};

/** For flows whose whole purpose is verification: an address the account does not hold fails the request. */
export const requireEmailVerified = async (ctx: DbContext, opts: EmailProofOpts): Promise<void> => {
  if (await markEmailVerified(ctx, opts)) return;
  throw new AppError(500, 'server_error', 'error', { meta: { reason: 'verified_address_not_on_account', userId: opts.userId } });
};

/**
 * Adds an inbox the user just proved to the ledger, or refreshes its stamps when it is already theirs. Throws 409 when
 * another account holds the address: a proof cannot move an address between accounts.
 */
export const addProvenEmail = async (ctx: DbContext, { userId, email, via }: EmailProofOpts): Promise<void> => {
  // No row back: another account holds the address.
  const row = await upsertProvenEmail(ctx, { userId, email, via });
  if (!row) throw new AppError(409, 'oauth_conflict', 'warn');

  await claimEmailForUser(ctx, { userId, email });
};
