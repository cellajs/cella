import { and, eq, sql } from 'drizzle-orm';
import type { EnabledOAuthProvider } from 'shared';
import { AppError } from '#/core/error';
import type { DbOrTx } from '#/db/db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

/** What proved the inbox: a magic-link click, or the click on the verification mail sent for a provider address. */
export type EmailProof = 'magic' | EnabledOAuthProvider;

interface EmailProofOpts {
  userId: string;
  email: string;
  by: EmailProof;
}

/** The columns an inbox proof writes: the stamps every time, `verifiedAt` only when it was never set. */
const proofStamps = (by: EmailProof, now: string) => ({
  verified: true,
  verifiedAt: sql<string>`coalesce(${emailsTable.verifiedAt}, ${now})`,
  lastVerifiedBy: by,
  lastVerifiedAt: now,
});

/**
 * Records an inbox proof on the user's address. Returns false when the user has no row for the address: the caller
 * proved ownership of an address the account does not hold, which is drift to surface, never to ignore.
 */
export const markEmailVerified = async (db: DbOrTx, { userId, email, by }: EmailProofOpts): Promise<boolean> => {
  const [stamped] = await db
    .update(emailsTable)
    .set(proofStamps(by, getIsoDate()))
    .where(and(eq(emailsTable.email, email), eq(emailsTable.userId, userId)))
    .returning({ id: emailsTable.id });
  return !!stamped;
};

/** For flows whose whole purpose is verification: an address the account does not hold fails the request. */
export const requireEmailVerified = async (db: DbOrTx, opts: EmailProofOpts): Promise<void> => {
  if (await markEmailVerified(db, opts)) return;
  throw new AppError(500, 'server_error', 'error', {
    meta: { reason: 'verified_address_not_on_account', userId: opts.userId },
  });
};

/**
 * Adds an inbox the user just proved to the ledger, or refreshes its stamps when it is already theirs. Throws 409 when
 * another account holds the address: a proof cannot move an address between accounts.
 */
export const addProvenEmail = async (db: DbOrTx, { userId, email, by }: EmailProofOpts): Promise<void> => {
  const now = getIsoDate();
  // One statement: insert, or on a taken address update only when this user holds it. No row back = someone else does.
  const [row] = await db
    .insert(emailsTable)
    .values({ email, userId, verified: true, verifiedAt: now, lastVerifiedBy: by, lastVerifiedAt: now })
    .onConflictDoUpdate({
      target: emailsTable.email,
      set: proofStamps(by, now),
      setWhere: eq(emailsTable.userId, userId),
    })
    .returning({ id: emailsTable.id });

  if (!row) throw new AppError(409, 'oauth_conflict', 'error');
};
