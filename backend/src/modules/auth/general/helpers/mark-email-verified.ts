import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

interface MarkEmailVerifiedOpts {
  userId: string;
  email: string;
}

/**
 * Marks the user's address as verified, once. Returns false when the user has no row for the address: the caller
 * proved ownership of an address the account does not hold, which is drift to surface, never to ignore.
 */
export const markEmailVerified = async (db: DbOrTx, { userId, email }: MarkEmailVerifiedOpts): Promise<boolean> => {
  const ownRow = and(eq(emailsTable.email, email), eq(emailsTable.userId, userId));

  const [verifiedNow] = await db
    .update(emailsTable)
    .set({ verified: true, verifiedAt: getIsoDate() })
    .where(and(ownRow, eq(emailsTable.verified, false)))
    .returning({ id: emailsTable.id });
  if (verifiedNow) return true;

  // Nothing updated: either verified earlier (fine) or no such row (drift).
  const [existing] = await db.select({ id: emailsTable.id }).from(emailsTable).where(ownRow).limit(1);
  return !!existing;
};
