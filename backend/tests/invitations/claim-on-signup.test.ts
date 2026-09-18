import { eq } from 'drizzle-orm';
import { membershipInvite } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { markEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { defaultHeaders } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const invitedEmail = 'newcomer@example.com';

setTestConfig({ enabledAuthStrategies: ['passkey'], selfRegistration: true });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('Pending invitations are claimed by an inbox proof', async () => {
  const call = await createAppClient();

  /** Invites `invitedEmail` to a fresh organization through the API, as that organization's admin. */
  const inviteToNewOrganization = async (index: number) => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser(
      `admin${index}@example.com`,
      organization.id,
      'admin',
      true,
      organization.tenantId,
    );
    const sessionCookie = await createTestSession(admin);

    const { response } = await call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: { emails: [invitedEmail], role: memberRole },
      query: { entityId: organization.id, entityType: 'organization' as const },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    expect(response.status).toBe(200);

    return organization;
  };

  const pendingFor = (email: string) =>
    db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.email, email));
  const tokensFor = (email: string) => db.select().from(tokensTable).where(eq(tokensTable.email, email));
  const newcomer = { email: invitedEmail, slug: 'newcomer', name: 'Newcomer', firstName: 'Newcomer' };

  it('claims nothing at sign-up: typing an address proves nothing', async () => {
    await inviteToNewOrganization(1);
    await inviteToNewOrganization(2);

    await handleCreateUser({ var: { db } }, { newUser: newcomer });

    // Anyone could have created this account, so the invitations stay unbound and their emailed links stay alive.
    const pending = await pendingFor(invitedEmail);
    expect(pending).toHaveLength(2);
    expect(pending.every((m) => m.userId === null)).toBe(true);
    expect(await tokensFor(invitedEmail)).toHaveLength(2);
  });

  it('binds every pending invitation at the first inbox proof, not just one', async () => {
    await inviteToNewOrganization(1);
    await inviteToNewOrganization(2);
    await inviteToNewOrganization(3);
    const user = await handleCreateUser({ var: { db } }, { newUser: newcomer });

    expect(await markEmailVerified(db, { userId: user.id, email: invitedEmail, by: 'magic' })).toBe(true);

    const pending = await pendingFor(invitedEmail);
    expect(pending).toHaveLength(3);
    expect(pending.every((m) => m.userId === user.id)).toBe(true);
    expect(await tokensFor(invitedEmail)).toHaveLength(0);
  });

  it('leaves invitations for other addresses untouched', async () => {
    await inviteToNewOrganization(1);
    const someone = { email: 'someone-else@example.com', slug: 'someone', name: 'Someone', firstName: 'Someone' };
    const user = await handleCreateUser({ var: { db } }, { newUser: someone });

    await markEmailVerified(db, { userId: user.id, email: someone.email, by: 'magic' });

    const [untouched] = await pendingFor(invitedEmail);
    expect(untouched.userId).toBeNull();
    expect(await tokensFor(invitedEmail)).toHaveLength(1);
  });

  it('names a taken address as email_exists', async () => {
    const newUser = { email: 'taken@example.com', slug: 'taken', name: 'Taken', firstName: 'Taken' };
    await handleCreateUser({ var: { db } }, { newUser });

    await expect(handleCreateUser({ var: { db } }, { newUser: { ...newUser, slug: 'taken-2' } })).rejects.toMatchObject(
      {
        status: 409,
        type: 'email_exists',
      },
    );
  });

  it('does not disguise another failure as a taken address', async () => {
    const newUser = { email: 'fresh@example.com', slug: 'fresh', name: 'x'.repeat(2000), firstName: 'Fresh' };

    const failure = await handleCreateUser({ var: { db } }, { newUser }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as { type?: string }).type).not.toBe('email_exists');
  });
});
