import { eq } from 'drizzle-orm';
import { membershipInvite, resendPendingInvitation, withdrawPendingInvitation } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization, endRateLimitWindows, expectRefusal, mailsTo } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Organization = { id: string; tenantId: string };
type Inviter = { sessionCookie: string };

/**
 * Anyone can create a tenant and invite any address from the app's sender, with their own name in the mail. The
 * inviter is the attacker: a tenant mails one address at most once a day, and all its admins together at most its
 * daily cap, however the invitations are made, reminded or withdrawn.
 */
describe('Invitation mail caps', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  const scope = (organization: Organization, inviter: Inviter) => ({
    path: { tenantId: organization.tenantId, organizationId: organization.id },
    headers: { ...defaultHeaders, Cookie: inviter.sessionCookie },
  });

  const invite = (organization: Organization, inviter: Inviter, emails: string[]) =>
    call(membershipInvite, {
      ...scope(organization, inviter),
      query: { entityId: organization.id, entityType: 'organization' },
      body: { emails, role: memberRole },
    });

  const invitationOf = async (organization: Organization, email: string) =>
    (await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.organizationId, organization.id))).find(
      (row) => row.email === email,
    );

  const linksTo = (email: string) => db.select({ id: tokensTable.id }).from(tokensTable).where(eq(tokensTable.email, email));

  async function tenantWithAdmins(label: string) {
    const organization = await createTestOrganization();
    const first = await createOrgUser(call, organization.tenantId, organization.id, `${label}-first`, adminRole);
    const second = await createOrgUser(call, organization.tenantId, organization.id, `${label}-second`, adminRole);
    return { organization, first, second };
  }

  it('must not mail more invitations per tenant per day than the cap', async () => {
    const { organization, first, second } = await tenantWithAdmins('tenant-cap');
    // A cap of three, so the test needs no 250 addresses.
    const restrictions = defaultRestrictions();
    await db
      .update(tenantsTable)
      .set({ restrictions: { ...restrictions, rateLimits: { ...restrictions.rateLimits, invitationMailsPerDay: 3 } } })
      .where(eq(tenantsTable.id, organization.tenantId));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((name) => `tenant-cap-${name}@security-test.com`);

    expect((await invite(organization, first, [a, b])).response.status).toBe(200);

    // A second admin of the tenant spends the same day, and a request the day cannot hold writes and sends nothing.
    await expectRefusal(await invite(organization, second, [c, d]), 429, 'invitation_limit_reached');
    expect([...mailsTo(c), ...mailsTo(d)]).toEqual([]);
    expect([await invitationOf(organization, c), await invitationOf(organization, d)]).toEqual([undefined, undefined]);

    // What the day still holds goes out; then a reminder, counted like a new invitation, finds it spent.
    expect((await invite(organization, second, [c])).response.status).toBe(200);
    expect(mailsTo(c)).toHaveLength(1);
    await endRateLimitWindows('invitationMailAddress');
    await expectRefusal(await invite(organization, first, [a]), 429, 'invitation_limit_reached');
    expect(mailsTo(a)).toHaveLength(1);
  });

  it.each([
    {
      path: 'invited again',
      again: async (organization: Organization, admins: { first: Inviter }, email: string) => invite(organization, admins.first, [email]),
    },
    {
      path: 'resent',
      again: async (organization: Organization, admins: { first: Inviter }, email: string) => {
        const invitation = await invitationOf(organization, email);
        const scoped = scope(organization, admins.first);
        return call(resendPendingInvitation, { ...scoped, path: { ...scoped.path, id: invitation?.id ?? '' } });
      },
    },
    {
      path: 'withdrawn and invited again',
      again: async (organization: Organization, admins: { first: Inviter }, email: string) => {
        const invitation = await invitationOf(organization, email);
        const scoped = scope(organization, admins.first);
        await call(withdrawPendingInvitation, { ...scoped, path: { ...scoped.path, id: invitation?.id ?? '' } });
        return invite(organization, admins.first, [email]);
      },
    },
    {
      path: 'invited by a second admin',
      again: async (organization: Organization, admins: { second: Inviter }, email: string) => invite(organization, admins.second, [email]),
    },
  ])('must not remind one address twice within a day: $path', async ({ path, again }) => {
    const { organization, first, second } = await tenantWithAdmins(`remind-${path.replaceAll(' ', '-')}`);
    const email = 'remind-victim@security-test.com';

    expect((await invite(organization, first, [email])).response.status).toBe(200);
    const [mailedLink] = await linksTo(email);

    // The inviter's call succeeds and sends nothing; the link in the inbox keeps working when the row stands.
    const { response } = await again(organization, { first, second }, email);
    expect(response.status).toBeLessThan(300);
    expect(mailsTo(email)).toHaveLength(1);
    expect(await linksTo(email)).toEqual(path === 'withdrawn and invited again' ? [] : [mailedLink]);

    // A day later the same call mails again.
    await endRateLimitWindows('invitationMailAddress');
    await again(organization, { first, second }, email);
    expect(mailsTo(email)).toHaveLength(2);
  });
});
