import { and, eq, sql } from 'drizzle-orm';
import type { EnabledOAuthProvider } from 'shared';
import { AppError } from '#/core/error';
import type { DbOrTx } from '#/db/db';
import { claimEmailForUser } from '#/modules/auth/general/helpers/claim-email';
import { identitiesTable } from '#/modules/auth/identities-db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

/** What proved the inbox: a magic-link click, or the click on the verification mail sent for a provider address. */
export type EmailProof = 'magic' | EnabledOAuthProvider;

interface EmailProofOpts {
  userId: string;
  email: string;
  via: EmailProof;
}

/** The columns an inbox proof writes: the stamps every time, `verifiedAt` only when it was never set. */
const proofStamps = (via: EmailProof, now: string) => ({
  verified: true,
  verifiedAt: sql<string>`coalesce(${emailsTable.verifiedAt}, ${now})`,
  lastVerifiedVia: via,
  lastVerifiedAt: now,
});

/**
 * Records an inbox proof on the user's address and claims the invitations waiting for it. Returns false when the user has no row for the address: the caller
 * proved ownership of an address the account does not hold, which is drift to surface, never to ignore.
 *
 * A proof of an address still unverified adopts the account: whoever created it proved nothing, so the provider
 * identities nobody verified are dropped, and a sign-up someone else started leaves no provider account on it.
 */
export const markEmailVerified = async (db: DbOrTx, { userId, email, via }: EmailProofOpts): Promise<boolean> => {
  const onAddress = and(eq(emailsTable.email, email), eq(emailsTable.userId, userId));
  const [before] = await db.select({ verified: emailsTable.verified }).from(emailsTable).where(onAddress);
  if (!before) return false;

  await db.update(emailsTable).set(proofStamps(via, getIsoDate())).where(onAddress);

  if (!before.verified) {
    await db
      .delete(identitiesTable)
      .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.verified, false)));
  }

  // The inbox is proven, so the invitations waiting for this address are this user's. Idempotent, one cheap lookup.
  await claimEmailForUser({ var: { db } }, { userId, email });
  return true;
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
export const addProvenEmail = async (db: DbOrTx, { userId, email, via }: EmailProofOpts): Promise<void> => {
  const now = getIsoDate();
  // One statement: insert, or on a taken address update only when this user holds it. No row back = someone else does.
  const [row] = await db
    .insert(emailsTable)
    .values({ email, userId, verified: true, verifiedAt: now, lastVerifiedVia: via, lastVerifiedAt: now })
    .onConflictDoUpdate({
      target: emailsTable.email,
      set: proofStamps(via, now),
      setWhere: eq(emailsTable.userId, userId),
    })
    .returning({ id: emailsTable.id });

  if (!row) throw new AppError(409, 'oauth_conflict', 'error');

  await claimEmailForUser({ var: { db } }, { userId, email });
};
