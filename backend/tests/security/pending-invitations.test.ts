import { eq } from 'drizzle-orm';
import { membershipInvite, resendPendingInvitation } from 'sdk';
import { hierarchy } from 'shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { mockPastIsoDate } from '#/mocks';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type PendingRow = Record<string, unknown> & { id: string; email: string };

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const [adminRole] = hierarchy.getRoles('organization');

/** An account's sign-up address, the second address it proved, and its avatar: what an inviter must not learn. */
const accountPrimary = 'pending-account-primary@security-test.com';
const accountAlternate = 'pending-account-alternate@security-test.com';
const accountAvatar = 'https://avatars.example.test/pending-account.png';
/** An address no account holds. */
const newcomer = 'pending-newcomer@security-test.com';

/**
 * Anyone can create a tenant with an organization and invite any address to it, so the inviter is the attacker here: an
 * invitation must look the same whether an account holds the address or not. Members still see who is invited
 * (decision 5), as they see every member's address.
 */
describe('Pending invitations list', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let organization: { id: string; tenantId: string };
  let inviter: { id: string; sessionCookie: string };
  let member: { id: string; email: string; sessionCookie: string };

  /** Raw JSON: the SDK's response parsing would hide a field the schema does not declare. */
  const listPending = async (as: { sessionCookie: string }) => {
    const query = new URLSearchParams({ entityId: organization.id, entityType: 'organization' });
    const response = await baseApp.request(
      `/${organization.tenantId}/${organization.id}/memberships/pending?${query}`,
      { headers: { ...defaultHeaders, Cookie: as.sessionCookie } },
    );
    return { status: response.status, items: ((await response.json()) as { items: PendingRow[] }).items };
  };

  const invite = (emails: string[]) =>
    call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization' },
      body: { emails, role: memberRole },
      headers: { ...defaultHeaders, Cookie: inviter.sessionCookie },
    });

  const resend = (id: string) =>
    call(resendPendingInvitation, {
      path: { tenantId: organization.tenantId, organizationId: organization.id, id },
      headers: { ...defaultHeaders, Cookie: inviter.sessionCookie },
    });

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    inviter = await createOrgUser(call, organization.tenantId, organization.id, 'pending-inviter', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'pending-member', memberRole);

    const account = await createTestUser(accountPrimary);
    await db.update(usersTable).set({ thumbnailUrl: accountAvatar }).where(eq(usersTable.id, account.id));
    await db.insert(emailsTable).values({
      email: accountAlternate,
      userId: account.id,
      verified: true,
      verifiedAt: mockPastIsoDate(),
    });

    const { response } = await invite([accountAlternate, newcomer]);
    expect(response.status).toBe(200);
  });

  beforeEach(() => {
    vi.mocked(mailer.prepareEmails).mockClear();
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
    const mailed = vi.mocked(mailer.prepareEmails).mock.calls.flatMap(([, , recipients]) => recipients);
    expect(mailed.map((recipient) => recipient.email).sort()).toEqual([accountAlternate, newcomer].sort());
  });

  it('must not tell an account from a new address via the membershipInvite response', async () => {
    const toAccount = await invite([accountPrimary]);
    const toNewcomer = await invite(['pending-newcomer-2@security-test.com']);
    expect(toAccount.response.status).toBe(200);
    expect(toAccount.data).toEqual(toNewcomer.data);
  });

  it('must not link another address to a member via the membershipInvite response', async () => {
    // A second address the member proved: the inviter knows members only by their listed address.
    const memberAlternate = 'pending-member-alternate@security-test.com';
    await db
      .insert(emailsTable)
      .values({ email: memberAlternate, userId: member.id, verified: true, verifiedAt: mockPastIsoDate() });

    const toMemberAlternate = await invite([memberAlternate]);
    const toNewcomer = await invite(['pending-newcomer-3@security-test.com']);
    expect(toMemberAlternate.response.status).toBe(200);
    expect(toMemberAlternate.data).toEqual(toNewcomer.data);

    // A member named by their listed address is refused, which the members list shows anyway (positive control).
    const toMember = await invite([member.email]);
    expect(toMember.data).toMatchObject({ rejectedIds: [member.email], invitesSentCount: 0 });
  });

  it('lists the invited addresses to a member too (positive control, decision 5)', async () => {
    const { status, items } = await listPending(member);
    expect(status).toBe(200);
    expect(items.map((item) => item.email)).toEqual(expect.arrayContaining([accountAlternate, newcomer]));
  });
});
