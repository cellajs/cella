import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/** Addresses compare lower case: a generated local part must be too. */
const suffix = () => nanoid(6).toLowerCase();

import { getAuthHealth, getMyAuth, getOrganization, getTokenData, sendMagicLink } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { connectionsTable, type InsertConnectionModel } from '#/modules/connections/connections-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { defaultHeaders, memberRole } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, createUser, expectRefusal, linkIdentity } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey', 'magic', 'sso'] });

// The deployment under test holds no federation client; the registry answers as if it did.
vi.mock('#/modules/auth/sso/helpers/federations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/modules/auth/sso/helpers/federations')>()),
  isFederationConfigured: () => true,
}));

afterEach(async () => await clearDatabase());

/** A tenant with its organization and a connection to an institution; `authStrategies` is the tenant's sign-in policy. */
const seed = async (overrides: Partial<InsertConnectionModel> = {}, authStrategies: string[] = []) => {
  const organization = await createTestOrganization();
  const [connection] = await db
    .insert(connectionsTable)
    .values({
      tenantId: organization.tenantId,
      kind: 'sso',
      issuer: 'surfconext',
      displayName: 'Hogeschool Utrecht',
      claimValues: ['hu.nl'],
      status: 'active',
      config: { idpEntityIds: ['https://idp.hu.nl/students'] },
      ...overrides,
    })
    .returning();
  await setPolicy(organization.tenantId, authStrategies);
  return { organization, connection };
};

const setPolicy = async (tenantId: string, authStrategies: string[]) => {
  await db
    .update(tenantsTable)
    .set({ authStrategies: authStrategies as never })
    .where(eq(tenantsTable.id, tenantId));
  invalidateCache.tenant(tenantId);
};

describe("the tenant's sign-in policy", async () => {
  const call = await createAppClient();

  it('binds a member who holds an identity through the connection, in whatever way they signed in; leaves externals alone', async () => {
    const { organization, connection } = await seed({}, ['surfconext']);
    const path = { tenantId: organization.tenantId, id: organization.id };

    const student = await createOrganizationAdminUser(`student-${suffix()}@hu.nl`, organization.id, memberRole, organization.tenantId);
    await linkIdentity(student, { kind: 'sso', issuer: 'surfconext', subject: `sub-${nanoid(6)}`, connectionId: connection.id });

    const viaMagic = await call(getOrganization, {
      path,
      headers: { ...defaultHeaders, Cookie: await createTestSession(student, { authStrategy: 'magic' }) },
    });
    await expectRefusal(viaMagic, 403, 'sso_required');
    expect((viaMagic.error as { meta?: Record<string, unknown> })?.meta).toMatchObject({
      connectionId: connection.id,
      entryPath: `/auth/sso/${connection.id}`,
    });

    const viaSso = await call(getOrganization, {
      path,
      headers: { ...defaultHeaders, Cookie: await createTestSession(student, { authStrategy: 'surfconext' }) },
    });
    expect(viaSso.response.status).toBe(200);

    // An external coach: a member with no institution account, bound by nothing.
    const coach = await createOrganizationAdminUser(`coach-${suffix()}@company.example`, organization.id, memberRole, organization.tenantId);
    const external = await call(getOrganization, {
      path,
      headers: { ...defaultHeaders, Cookie: await createTestSession(coach, { authStrategy: 'magic' }) },
    });
    expect(external.response.status).toBe(200);

    // Without a policy the bound member signs in any way.
    await setPolicy(organization.tenantId, []);
    const unpoliced = await call(getOrganization, {
      path,
      headers: { ...defaultHeaders, Cookie: await createTestSession(student, { authStrategy: 'magic' }) },
    });
    expect(unpoliced.response.status).toBe(200);
  });

  it('refuses a magic link to an address the institution proved while the tenant excludes magic links', async () => {
    const { organization, connection } = await seed({}, ['surfconext']);
    const email = `l.jansen-${suffix()}@hu.nl`;
    const user = await createUser(email);
    await linkIdentity(user, { kind: 'sso', issuer: 'surfconext', subject: `sub-${nanoid(6)}`, connectionId: connection.id });
    await db.update(emailsTable).set({ lastVerifiedVia: 'surfconext' }).where(eq(emailsTable.email, email));

    const refused = await call(sendMagicLink, { body: { email }, headers: defaultHeaders });
    await expectRefusal(refused, 403, 'sso_required');
    expect((refused.error as { meta?: Record<string, unknown> })?.meta).toMatchObject({ connectionId: connection.id });

    // The policy allows magic links again: the address is a sign-in identifier as before.
    await setPolicy(organization.tenantId, []);
    expect((await call(sendMagicLink, { body: { email }, headers: defaultHeaders })).response.status).toBe(204);
  });
});

describe('what the sign-in surfaces read', async () => {
  const call = await createAppClient();

  it('lists the federations with a connected institution for the generic entrance', async () => {
    await seed();
    const { data } = await call(getAuthHealth, { headers: defaultHeaders });
    expect((data as { federations: { key: string; label: string }[] }).federations).toContainEqual({ key: 'surfconext', label: 'SURFconext' });
  });

  it("names the invited organization's institution on the invitation data", async () => {
    const { organization, connection } = await seed();
    const inviter = await createUser(`teacher-${suffix()}@hu.nl`);
    const { token, invitationCookie } = await createInvitation({
      organization,
      email: `s.devries-${suffix()}@student.hu.nl`,
      createdBy: inviter.id,
      token: 'invoked',
    });

    const { data } = await call(getTokenData, {
      path: { type: 'invitation', id: token.id },
      headers: { ...defaultHeaders, Cookie: invitationCookie },
    });
    expect((data as { ssoConnectionId?: string }).ssoConnectionId).toBe(connection.id);
  });

  it("lists the institutions of the user's organizations on the account page, connected or not", async () => {
    const { organization, connection } = await seed();
    const user = await createOrganizationAdminUser(`member-${suffix()}@hu.nl`, organization.id, memberRole, organization.tenantId);
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };

    const before = await call(getMyAuth, { headers });
    expect((before.data as { institutions: unknown[] }).institutions).toEqual([
      { connectionId: connection.id, displayName: 'Hogeschool Utrecht', federation: { key: 'surfconext', label: 'SURFconext' }, connected: false },
    ]);

    await linkIdentity(user, { kind: 'sso', issuer: 'surfconext', subject: `sub-${nanoid(6)}`, connectionId: connection.id });
    const after = await call(getMyAuth, { headers });
    expect((after.data as { institutions: { connected: boolean }[] }).institutions[0].connected).toBe(true);
  });
});
