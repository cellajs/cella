import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { markEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import { reapUnprovenAccounts } from '#/modules/auth/jobs/reap-unproven-accounts';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { createTestOrganization, createTestSession, createTestUser, linkIdentity } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { clearDatabase } from '../test-utils';

afterEach(async () => await clearDatabase());

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
/** Runs the reaper as if eight days had passed, so every account created in the test is past the TTL. */
const reapLater = () => reapUnprovenAccounts(new Date(Date.now() + EIGHT_DAYS_MS));
const exists = async (userId: string) =>
  (await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId))).length === 1;

describe('reapUnprovenAccounts', () => {
  it('removes an account whose sign-up link was never clicked, freeing its address', async () => {
    const squat = await createTestUser('squatted@example.com', false);

    expect(await reapLater()).toBe(1);

    expect(await exists(squat.id)).toBe(false);
    // The address is free again for its owner.
    await expect(createTestUser('squatted@example.com', false)).resolves.toBeDefined();
  });

  it('leaves a fresh unproven account alone', async () => {
    const fresh = await createTestUser('fresh@example.com', false);
    // The fixture backdates createdAt; a real sign-up from a minute ago is what this case is about.
    await db
      .update(usersTable)
      .set({ createdAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(usersTable.id, fresh.id));

    expect(await reapUnprovenAccounts()).toBe(0);

    expect(await exists(fresh.id)).toBe(true);
  });

  it('keeps every account that was proven or used', async () => {
    const verified = await createTestUser('verified@example.com');
    const viaIdentity = await createTestUser('identity@example.com', false);
    await linkIdentity(viaIdentity);
    const signedIn = await createTestUser('signed-in@example.com', false);
    await db.insert(userCountersTable).values({ userId: signedIn.id, lastSignInAt: new Date().toISOString() });
    const withSession = await createTestUser('session@example.com', false);
    await createTestSession(withSession);

    expect(await reapLater()).toBe(0);

    for (const user of [verified, viaIdentity, signedIn, withSession]) expect(await exists(user.id)).toBe(true);
  });

  it('releases invitations bound to a reaped account, and the real owner claims them by proving the address', async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const squat = await createTestUser('invited@example.com', false);
    const { inactiveMembership } = await createInvitation({
      organization,
      email: 'invited@example.com',
      createdBy: inviter.id,
      boundTo: squat.id,
    });

    expect(await reapLater()).toBe(1);

    const [released] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(released.userId).toBeNull();

    const owner = await createTestUser('invited@example.com', false);
    await markEmailVerified(db, { userId: owner.id, email: owner.email, by: 'magic' });
    const [claimed] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(claimed.userId).toBe(owner.id);
  });
});
