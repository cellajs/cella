import { and, eq } from 'drizzle-orm';
import type { EnabledOAuthProvider } from 'shared';
import { AppError } from '#/core/error';
import type { DbOrTx } from '#/db/db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

/** What proved the inbox: a magic-link click, or the click on the verification mail sent for a provider address. */
export type EmailProof = 'magic' | EnabledOAuthProvider;

interface MarkEmailVerifiedOpts {
  userId: string;
  email: string;
  by: EmailProof;
}

/**
 * Records an inbox proof on the user's address: `lastVerifiedBy` and `lastVerifiedAt` on every proof, `verified` and
 * `verifiedAt` on the first. Returns false when the user has no row for the address: the caller proved ownership of
 * an address the account does not hold, which is drift to surface, never to ignore.
 */
export const markEmailVerified = async (db: DbOrTx, { userId, email, by }: MarkEmailVerifiedOpts): Promise<boolean> => {
  const now = getIsoDate();
  const [row] = await db
    .select({ verified: emailsTable.verified })
    .from(emailsTable)
    .where(and(eq(emailsTable.email, email), eq(emailsTable.userId, userId)))
    .limit(1);
  if (!row) return false;

  await db
    .update(emailsTable)
    .set({
      lastVerifiedBy: by,
      lastVerifiedAt: now,
      ...(!row.verified && { verified: true, verifiedAt: now }),
    })
    .where(and(eq(emailsTable.email, email), eq(emailsTable.userId, userId)));

  return true;
};

/** For flows whose whole purpose is verification: an address the account does not hold fails the request. */
export const requireEmailVerified = async (db: DbOrTx, opts: MarkEmailVerifiedOpts): Promise<void> => {
  if (await markEmailVerified(db, opts)) return;
  throw new AppError(500, 'server_error', 'error', {
    meta: { reason: 'verified_address_not_on_account', userId: opts.userId },
  });
};

interface AddProvenEmailOpts {
  userId: string;
  email: string;
  by: EmailProof;
}

/**
 * Adds an inbox the user just proved to the ledger, or refreshes its stamps when it is already theirs. Throws 409 when
 * another account holds the address: a proof cannot move an address between accounts.
 */
export const addProvenEmail = async (db: DbOrTx, { userId, email, by }: AddProvenEmailOpts): Promise<void> => {
  const [holder] = await db
    .select({ userId: emailsTable.userId })
    .from(emailsTable)
    .where(eq(emailsTable.email, email))
    .limit(1);

  if (holder && holder.userId !== userId) throw new AppError(409, 'oauth_conflict', 'error');
  if (holder) {
    await markEmailVerified(db, { userId, email, by });
    return;
  }

  const now = getIsoDate();
  await db
    .insert(emailsTable)
    .values({ email, userId, verified: true, verifiedAt: now, lastVerifiedBy: by, lastVerifiedAt: now });
};
