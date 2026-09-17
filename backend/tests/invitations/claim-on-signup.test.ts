import { eq } from 'drizzle-orm';
import { membershipInvite } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
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

describe('Pending invitations claimed at sign-up', async () => {
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

  it('binds every pending invitation for the address, not just one', async () => {
    await inviteToNewOrganization(1);
    await inviteToNewOrganization(2);
    await inviteToNewOrganization(3);

    const before = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.email, invitedEmail));
    expect(before).toHaveLength(3);
    expect(before.every((m) => m.userId === null)).toBe(true);

    const user = await handleCreateUser(
      { var: { db } },
      { newUser: { email: invitedEmail, slug: 'newcomer', name: 'Newcomer', firstName: 'Newcomer' } },
    );

    const after = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.email, invitedEmail));
    expect(after).toHaveLength(3);
    expect(after.every((m) => m.userId === user.id)).toBe(true);

    const remainingTokens = await db.select().from(tokensTable).where(eq(tokensTable.email, invitedEmail));
    expect(remainingTokens).toHaveLength(0);
  });

  it('leaves invitations for other addresses untouched', async () => {
    await inviteToNewOrganization(1);

    await handleCreateUser(
      { var: { db } },
      { newUser: { email: 'someone-else@example.com', slug: 'someone', name: 'Someone', firstName: 'Someone' } },
    );

    const [untouched] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.email, invitedEmail));
    expect(untouched.userId).toBeNull();

    const tokens = await db.select().from(tokensTable).where(eq(tokensTable.email, invitedEmail));
    expect(tokens).toHaveLength(1);
  });
});
