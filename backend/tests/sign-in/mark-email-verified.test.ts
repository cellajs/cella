import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import {
  addProvenEmail,
  markEmailVerified,
  requireEmailVerified,
} from '#/modules/auth/general/helpers/mark-email-verified';
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

    expect(await markEmailVerified(db, { userId: user.id, email: user.email, by: 'magic' })).toBe(true);

    const row = await emailRow(user.email);
    expect(row.verified).toBe(true);
    expect(row.verifiedAt).not.toBeNull();
    expect(row.lastVerifiedBy).toBe('magic');
    expect(row.lastVerifiedAt).toBe(row.verifiedAt);
  });

  it('stamps every proof but keeps the first verification time', async () => {
    const user = await createTestUser('twice@example.com', false);
    await markEmailVerified(db, { userId: user.id, email: user.email, by: 'magic' });
    const first = await emailRow(user.email);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await markEmailVerified(db, { userId: user.id, email: user.email, by: 'github' });
    const second = await emailRow(user.email);

    expect(second.verifiedAt).toBe(first.verifiedAt);
    expect(second.lastVerifiedBy).toBe('github');
    expect(second.lastVerifiedAt).not.toBe(first.lastVerifiedAt);
  });

  it('keeps the original verification time when already verified', async () => {
    const user = await createTestUser('verified@example.com');
    const before = await emailRow(user.email);

    expect(await markEmailVerified(db, { userId: user.id, email: user.email, by: 'magic' })).toBe(true);

    expect((await emailRow(user.email)).verifiedAt).toBe(before.verifiedAt);
  });

  it('reports an address the account does not hold instead of passing silently', async () => {
    const user = await createTestUser('owner@example.com');
    const other = await createTestUser('other@example.com', false);

    expect(await markEmailVerified(db, { userId: user.id, email: 'nobody@example.com', by: 'magic' })).toBe(false);
    // Another account's address is never touched.
    expect(await markEmailVerified(db, { userId: user.id, email: other.email, by: 'magic' })).toBe(false);
    expect((await emailRow(other.email)).verified).toBe(false);
  });

  it('fails a verification flow on an address the account does not hold', async () => {
    const user = await createTestUser('owner@example.com');

    await expect(
      requireEmailVerified(db, { userId: user.id, email: 'nobody@example.com', by: 'magic' }),
    ).rejects.toMatchObject({
      status: 500,
    });
    await expect(
      requireEmailVerified(db, { userId: user.id, email: user.email, by: 'magic' }),
    ).resolves.toBeUndefined();
  });
});

describe('addProvenEmail', () => {
  it('adds a proven inbox to the account as a verified, stamped row', async () => {
    const user = await createTestUser('owner@example.com');

    await addProvenEmail(db, { userId: user.id, email: 'work@example.com', by: 'github' });

    const row = await emailRow('work@example.com');
    expect(row).toMatchObject({ userId: user.id, verified: true, lastVerifiedBy: 'github' });
    expect(row.verifiedAt).not.toBeNull();
    expect(row.lastVerifiedAt).toBe(row.verifiedAt);
  });

  it("refreshes the stamps when the address is already the account's", async () => {
    const user = await createTestUser('owner@example.com');
    const before = await emailRow(user.email);

    await addProvenEmail(db, { userId: user.id, email: user.email, by: 'github' });

    const after = await emailRow(user.email);
    expect(after.id).toBe(before.id);
    expect(after.verifiedAt).toBe(before.verifiedAt);
    expect(after.lastVerifiedBy).toBe('github');
  });

  it('never moves an address held by another account', async () => {
    const owner = await createTestUser('owner@example.com');
    const other = await createTestUser('other@example.com');

    await expect(addProvenEmail(db, { userId: other.id, email: owner.email, by: 'github' })).rejects.toMatchObject({
      status: 409,
      type: 'oauth_conflict',
    });
    expect((await emailRow(owner.email)).userId).toBe(owner.id);
  });
});
