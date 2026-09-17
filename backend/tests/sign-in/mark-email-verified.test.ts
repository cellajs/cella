import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { markEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import { emailsTable } from '#/modules/user/emails-db';
import { createTestUser } from '../helpers';
import { clearDatabase } from '../test-utils';

afterEach(async () => await clearDatabase());

const emailRow = async (email: string) => {
  const [row] = await db.select().from(emailsTable).where(eq(emailsTable.email, email));
  return row;
};

describe('markEmailVerified', () => {
  it('verifies an unverified address of the account', async () => {
    const user = await createTestUser('unverified@example.com', false);

    expect(await markEmailVerified(db, { userId: user.id, email: user.email })).toBe(true);

    const row = await emailRow(user.email);
    expect(row.verified).toBe(true);
    expect(row.verifiedAt).not.toBeNull();
  });

  it('keeps the original verification time when already verified', async () => {
    const user = await createTestUser('verified@example.com');
    const before = await emailRow(user.email);

    expect(await markEmailVerified(db, { userId: user.id, email: user.email })).toBe(true);

    expect((await emailRow(user.email)).verifiedAt).toBe(before.verifiedAt);
  });

  it('reports an address the account does not hold instead of passing silently', async () => {
    const user = await createTestUser('owner@example.com');
    const other = await createTestUser('other@example.com', false);

    expect(await markEmailVerified(db, { userId: user.id, email: 'nobody@example.com' })).toBe(false);
    // Another account's address is never touched.
    expect(await markEmailVerified(db, { userId: user.id, email: other.email })).toBe(false);
    expect((await emailRow(other.email)).verified).toBe(false);
  });
});
