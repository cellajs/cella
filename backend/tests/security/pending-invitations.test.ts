import { eq } from 'drizzle-orm';
import { checkMembershipInvite, membershipInvite, resendPendingInvitation, withdrawPendingInvitation } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization, createTestUser, rawJsonRequest, sentMails } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type PendingRow = Record<string, unknown> & { id: string; email: string };

/** An account's sign-up address, the second address it proved, and its avatar: what an inviter must not learn. */
const accountPrimary = 'pending-account-primary@security-test.com';
const accountAlternate = 'pending-account-alternate@security-test.com';
const accountAvatar = 'https://avatars.example.test/pending-account.png';
/** An address no account holds. */
const newcomer = 'pending-newcomer@security-test.com';

/**
 * Anyone can create a tenant with an organization and invite any address to it, so the inviter is the attacker here: an
 * invitation must look the same whether an account holds the address or not. Members still see who is invited, as
 * they see every member's address (`cella/PERMISSIONS.md`, What members see).
 */
describe('Pending invitations list', async () => {
  const call = await createAppClient();
  let organization: { id: string; tenantId: string };
  let inviter: { id: string; sessionCookie: string };
  let member: { id: string; email: string; sessionCookie: string };

  const listPending = async (as: { sessionCookie: string }) => {
    const query = new URLSearchParams({ entityId: organization.id, entityType: 'organization' });
    const path = `/${organization.tenantId}/${organization.id}/memberships/pending?${query}`;
    const { status, body } = await rawJsonRequest(path, as.sessionCookie);
    return { status, items: (body as { items: PendingRow[] }).items };
  };

  const invite = (emails: string[]) =>
    call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization' },
      body: { emails, role: memberRole },
      headers: { ...defaultHeaders, Cookie: inviter.sessionCookie },
    });

  const check = (emails: string[]) =>
    call(checkMembershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization' },
      body: { emails },
      headers: { ...defaultHeaders, Cookie: inviter.sessionCookie },
    });

  /** A response with each outcome's address left out: the address is the inviter's own input, the rest is the answer. */
  const answer = (data: unknown) => {
    const { outcomes, ...rest } = data as { outcomes: { email: string }[] };
    return { ...rest, outcomes: outcomes.map(({ email: _, ...outcome }) => outcome) };
  };

  const resend = (id: string) =>
    call(resendPendingInvitation, {
      path: { tenantId: organization.tenantId, organizationId: organization.id, id },
      headers: { ...defaultHeaders, Cookie: inviter.sessionCookie },
    });

  beforeAll(async () => {
    organization = await createTestOrganization();
    inviter = await createOrgUser(call, organization.tenantId, organization.id, 'pending-inviter', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'pending-member', memberRole);

    const account = await createTestUser(accountPrimary);
    await db.update(usersTable).set({ thumbnailUrl: accountAvatar }).where(eq(usersTable.id, account.id));
    await db.insert(emailsTable).values({ email: accountAlternate, userId: account.id, verifiedAt: mockPastIsoDate() });

    const { response } = await invite([accountAlternate, newcomer]);
    expect(response.status).toBe(200);
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not reveal an account behind an invited address via getPendingMemberships', async () => {
    const { status, items } = await listPending(inviter);
    expect(status).toBe(200);

    // Each row names the address the invitation went to, never the address or avatar of an account holding it.
    expect(items.map((item) => item.email).sort()).toEqual([accountAlternate, newcomer].sort());
    expect(JSON.stringify(items)).not.toContain(accountPrimary);
    expect(JSON.stringify(items)).not.toContain(accountAvatar);

    // Both rows carry the same fields: no user field, and no token id that only a new address would have.
    const [first, second] = items;
    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    for (const item of items) {
      expect(item).not.toHaveProperty('userId');
      expect(item).not.toHaveProperty('thumbnailUrl');
      expect(item).not.toHaveProperty('tokenId');
    }
  });

  it('must not tell an account from a new address via resendPendingInvitation', async () => {
    const { items } = await listPending(inviter);
    const byEmail = new Map(items.map((item) => [item.email, item.id]));

    const toAccount = await resend(byEmail.get(accountAlternate) ?? '');
    const toNewcomer = await resend(byEmail.get(newcomer) ?? '');
    expect(toAccount.response.status).toBe(204);
    expect(toNewcomer.response.status).toBe(204);

    // Each resend mailed the invited address itself.
    expect(
      sentMails()
        .map(({ recipient }) => recipient.email)
        .sort(),
    ).toEqual([accountAlternate, newcomer].sort());
  });

  it('must not tell an account from a new address via the membershipInvite response', async () => {
    const toAccount = await invite([accountPrimary]);
    const toNewcomer = await invite(['pending-newcomer-2@security-test.com']);
    expect(toAccount.response.status).toBe(200);
    expect(answer(toAccount.data)).toEqual(answer(toNewcomer.data));
  });

  it('must not tell an account from a new address via the invite check', async () => {
    const forAccount = await check(['pending-account-checked@security-test.com']);
    await createTestUser('pending-account-checked@security-test.com');
    const forAccountHeld = await check(['pending-account-checked@security-test.com']);
    const forNewcomer = await check(['pending-newcomer-checked@security-test.com']);
    expect(forAccountHeld.response.status).toBe(200);
    expect(answer(forAccountHeld.data)).toEqual(answer(forNewcomer.data));
    expect(answer(forAccountHeld.data)).toEqual(answer(forAccount.data));
  });

  it('must not link another address to a member via the membershipInvite response', async () => {
    // A second address the member proved: the inviter knows members only by their listed address.
    const memberAlternate = 'pending-member-alternate@security-test.com';
    await db.insert(emailsTable).values({ email: memberAlternate, userId: member.id, verifiedAt: mockPastIsoDate() });
    expect(answer((await check([memberAlternate])).data)).toEqual(answer((await check(['pending-newcomer-4@security-test.com'])).data));

    const toMemberAlternate = await invite([memberAlternate]);
    const toNewcomer = await invite(['pending-newcomer-3@security-test.com']);
    expect(toMemberAlternate.response.status).toBe(200);
    expect(answer(toMemberAlternate.data)).toEqual(answer(toNewcomer.data));

    // A member named by their listed address is left out, which the members list shows anyway (positive control).
    const toMember = await invite([member.email]);
    expect(toMember.data).toMatchObject({ outcomes: [{ email: member.email, outcome: 'member' }] });
  });

  it('lists the invited addresses to a member too (positive control)', async () => {
    const { status, items } = await listPending(member);
    expect(status).toBe(200);
    expect(items.map((item) => item.email)).toEqual(expect.arrayContaining([accountAlternate, newcomer]));
  });

  it('must not let a member withdraw an invitation; the inviter can (positive control)', async () => {
    const address = 'pending-withdrawn@security-test.com';
    await invite([address]);
    const target = (await listPending(inviter)).items.find((item) => item.email === address)!;
    const withdraw = (as: { sessionCookie: string }) =>
      call(withdrawPendingInvitation, {
        path: { tenantId: organization.tenantId, organizationId: organization.id, id: target.id },
        headers: { ...defaultHeaders, Cookie: as.sessionCookie },
      });

    expect((await withdraw(member)).response.status).toBe(403);
    expect((await listPending(inviter)).items.map((item) => item.email)).toContain(address);

    expect((await withdraw(inviter)).response.status).toBe(204);
    expect((await listPending(inviter)).items.map((item) => item.email)).not.toContain(address);
  });
});
