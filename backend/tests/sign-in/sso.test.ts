import { eq } from 'drizzle-orm';
import { getSsoEntry, sendMagicLink, sendSsoRecoveryLink, ssoCallback, startSso, startSsoFederation } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { identitiesTable } from '#/modules/auth/oauth/identities-db';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { exchangeFederationCode } from '#/modules/auth/sso/helpers/federation-client';
import { roleFromClaims } from '#/modules/auth/sso/role-from-claims';
import { tokensTable } from '#/modules/auth/tokens-db';
import { connectionsTable, type InsertConnectionModel } from '#/modules/connections/connections-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import {
  cookieChange,
  createTestOrganization,
  createUser,
  expectRefusal,
  getUserByEmail,
  insertTestSession,
  insertTestToken,
  linkIdentity,
} from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { clearCookieStore, clearDatabase, mockCookieStore, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey', 'sso'], selfRegistration: false });

// The federation itself is out of reach: the client answers with the claims a test hands it, and the authorization URL
// echoes the state and the IdP pin so the round trip can be followed.
vi.mock('#/modules/auth/sso/helpers/federation-client', () => ({
  createFederationAuthorizationUrl: vi.fn(async (_federation: unknown, { state, loginHint }: { state: string; loginHint?: string }) => {
    const url = new URL('https://connect.test.surfconext.nl/oidc/authorize');
    url.searchParams.set('state', state);
    if (loginHint) url.searchParams.set('login_hint', loginHint);
    return url;
  }),
  exchangeFederationCode: vi.fn(),
  discoverFederation: vi.fn(),
  forgetFederation: vi.fn(),
}));
// The deployment under test holds no federation client; the registry answers as if it did.
vi.mock('#/modules/auth/sso/helpers/federations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/sso/helpers/federations')>();
  return {
    ...actual,
    isFederationConfigured: () => true,
    getFederation: (key: keyof typeof appConfig.federations) => ({
      ...appConfig.federations[key],
      key,
      clientId: 'test.projectcampus.com',
      clientSecret: 'test-secret',
      redirectUri: `${appConfig.backendAuthUrl}/sso/callback`,
    }),
  };
});
// The role seam is the app's to fill: a test stands in for an app's mapping, the default stays real.
vi.mock('#/modules/auth/sso/role-from-claims', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/sso/role-from-claims')>();
  return { ...actual, roleFromClaims: vi.fn(actual.roleFromClaims) };
});
vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock());
vi.mock('#/modules/auth/sessions/operations/create-session', async (importOriginal) =>
  (await import('../test-utils')).createSessionMock(importOriginal),
);
vi.mock('#/modules/auth/sessions/operations/resolve-session', async (importOriginal) =>
  (await import('../test-utils')).resolveSessionMock(importOriginal),
);

afterEach(async () => {
  await clearDatabase();
  clearCookieStore();
  vi.mocked(exchangeFederationCode).mockReset();
});

const subject = '0dd64f5cf2a23bef04a1e2ec225e76ff3935cece';
const studentEmail = 's.devries@student.hu.nl';

/** What SURFconext asserts for a Hogeschool Utrecht student, shaped like the test IdP's id_token plus userinfo. */
const claimsOf = (overrides: Record<string, unknown> = {}) => ({
  iss: 'https://connect.test.surfconext.nl',
  sub: subject,
  schac_home_organization: 'hu.nl',
  email: studentEmail,
  given_name: 'Sanne',
  family_name: 'de Vries',
  eduperson_affiliation: ['student', 'member'],
  eduperson_scoped_affiliation: ['student@hu.nl'],
  acr: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  ...overrides,
});

/** A tenant with its organization and an active connection to Hogeschool Utrecht, which runs two IdPs. */
const seedConnection = async (overrides: Partial<InsertConnectionModel> = {}) => {
  const organization = await createTestOrganization();
  const [connection] = await db
    .insert(connectionsTable)
    .values({
      tenantId: organization.tenantId,
      kind: 'sso',
      issuer: 'surfconext',
      displayName: 'Hogeschool Utrecht',
      claimValues: ['hu.nl', 'student.hu.nl'],
      status: 'active',
      config: { idpEntityIds: ['https://idp.hu.nl/students', 'https://idp.hu.nl/employees'] },
      ...overrides,
    })
    .returning();
  return { organization, connection };
};

const identitiesOf = (userId: string) => db.select().from(identitiesTable).where(eq(identitiesTable.userId, userId));
const membershipsOf = (userId: string) => db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));

describe('SSO sign-in through an institution', async () => {
  const call = await createAppClient();

  const stateOf = (response: Response) => new URL(response.headers.get('location') ?? 'http://x').searchParams.get('state') ?? '';
  const statePayload = (state: string) => JSON.parse(mockCookieStore.get(`oauth-state-${state}`) ?? '{}');
  const start = (connectionId: string, query: Record<string, string> = {}) =>
    call(startSso, { path: { connectionId }, query, headers: defaultHeaders });
  const finish = async (state: string, claims: Record<string, unknown>) => {
    vi.mocked(exchangeFederationCode).mockResolvedValueOnce(claims as never);
    return call(ssoCallback, { query: { state, code: 'the-code' }, headers: defaultHeaders });
  };
  const signInThrough = async (connectionId: string, claims: Record<string, unknown> = claimsOf()) =>
    finish(stateOf((await start(connectionId)).response), claims);
  const lastSessionCall = () => vi.mocked(setUserSession).mock.calls.at(-1)?.slice(2);

  it('tells the entry page what to show, by the connection id alone', async () => {
    const { organization, connection } = await seedConnection();
    const { response, data } = await call(getSsoEntry, { path: { connectionId: connection.id }, headers: defaultHeaders });
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: connection.id,
      status: 'active',
      federation: { key: 'surfconext', label: 'SURFconext' },
      institution: { displayName: 'Hogeschool Utrecht', logoUrl: null },
      organization: { id: organization.id, name: organization.name },
    });

    await expectRefusal(await call(getSsoEntry, { path: { connectionId: generateId() }, headers: defaultHeaders }), 404, 'not_found');
  });

  it("sends the browser to the federation pinned to the institution's IdPs, and stores the round trip", async () => {
    const { connection } = await seedConnection();
    const { response } = await start(connection.id);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://connect.test.surfconext.nl');
    expect(location.searchParams.get('login_hint')).toBe('https://idp.hu.nl/students,https://idp.hu.nl/employees');

    const payload = statePayload(stateOf(response));
    expect(payload).toMatchObject({ provider: 'surfconext', type: 'auth', connectionId: connection.id });
    expect(payload.codeVerifier).toBeTruthy();
    expect(payload.nonce).toBeTruthy();
  });

  it('refuses before the redirect: a connection that is not active, an unknown one, and a flow SSO does not run', async () => {
    const pending = await seedConnection({ status: 'pending' });
    await expectRefusal(await start(pending.connection.id), 403, 'sso_not_active', 'pending');

    const disabled = await seedConnection({ status: 'disabled' });
    await expectRefusal(await start(disabled.connection.id), 403, 'sso_not_active', 'disabled');

    await expectRefusal(await start(generateId()), 404, 'not_found', 'unknown');

    const active = await seedConnection();
    await expectRefusal(await start(active.connection.id, { type: 'invite' }), 400, 'invalid_request', 'invite flow');
  });

  it('a first sign-in creates the account, its verified identity and its membership, with the address proven by the institution', async () => {
    const { organization, connection } = await seedConnection();
    const { response } = await signInThrough(connection.id);

    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');

    const [user] = await getUserByEmail(studentEmail);
    expect(user).toMatchObject({ name: 'Sanne de Vries', firstName: 'Sanne', lastName: 'de Vries' });

    const [identity] = await identitiesOf(user.id);
    expect(identity).toMatchObject({ kind: 'sso', issuer: 'surfconext', subject, email: studentEmail, verified: true, connectionId: connection.id });
    expect(identity.data).toMatchObject({ eduperson_affiliation: ['student', 'member'], acr: claimsOf().acr });

    const [address] = await db.select().from(emailsTable).where(eq(emailsTable.email, studentEmail));
    expect(address).toMatchObject({ userId: user.id, verifiedAt: expect.any(String), lastVerifiedVia: 'surfconext' });

    expect(await membershipsOf(user.id)).toMatchObject([{ channelType: 'organization', channelId: organization.id, role: memberRole }]);

    // The session records the method and the connection it came through.
    expect(lastSessionCall()).toEqual(['surfconext', 'regular', { connectionId: connection.id }]);
  });

  it('a returning identity signs in without a second account or membership, refreshing its snapshot; it needs no address', async () => {
    const { connection } = await seedConnection();
    await signInThrough(connection.id);
    const [user] = await getUserByEmail(studentEmail);

    const { response } = await signInThrough(connection.id, claimsOf({ email: undefined, eduperson_affiliation: ['employee', 'member'] }));
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');

    expect(await getUserByEmail(studentEmail)).toHaveLength(1);
    const [identity] = await identitiesOf(user.id);
    expect(identity.lastUsedAt).not.toBeNull();
    expect(identity.data).toMatchObject({ eduperson_affiliation: ['employee', 'member'] });
    expect(await membershipsOf(user.id)).toHaveLength(1);
  });

  it('refuses an account from an institution the connection does not accept, eduID included', async () => {
    const { connection } = await seedConnection();

    await expectRefusal(
      await signInThrough(connection.id, claimsOf({ schac_home_organization: 'uu.nl' })),
      403,
      'sso_wrong_institution',
      'other institution',
    );
    await expectRefusal(await signInThrough(connection.id, claimsOf({ schac_home_organization: 'eduid.nl' })), 403, 'sso_wrong_institution', 'eduID');
    await expectRefusal(
      await signInThrough(connection.id, claimsOf({ schac_home_organization: undefined })),
      403,
      'sso_wrong_institution',
      'no claim',
    );

    expect(await getUserByEmail(studentEmail)).toHaveLength(0);
  });

  it('a first sign-in needs an address, and refuses one another account holds', async () => {
    const { connection } = await seedConnection();

    await expectRefusal(await signInThrough(connection.id, claimsOf({ email: undefined })), 400, 'sso_email_missing');
    expect(await getUserByEmail(studentEmail)).toHaveLength(0);

    await createUser(studentEmail);
    await expectRefusal(await signInThrough(connection.id), 409, 'sso_email_exists');
    expect(await identitiesOf((await getUserByEmail(studentEmail))[0].id)).toHaveLength(0);
  });

  it('the role of a granted membership comes from the role seam, which reads every claim of the sign-in', async () => {
    const { organization, connection } = await seedConnection();
    const claims = claimsOf({ eduperson_affiliation: ['employee', 'member'] });
    vi.mocked(roleFromClaims).mockReturnValueOnce(adminRole);

    expect((await signInThrough(connection.id, claims)).response.status).toBe(302);

    const [user] = await getUserByEmail(studentEmail);
    expect(await membershipsOf(user.id)).toMatchObject([{ channelId: organization.id, role: adminRole }]);
    expect(vi.mocked(roleFromClaims).mock.calls.at(-1)?.[0]).toMatchObject({
      federation: 'surfconext',
      connection: { id: connection.id },
      claims: { eduperson_affiliation: ['employee', 'member'] },
    });

    // A later sign-in keeps the role: the seam is not asked again.
    const asked = vi.mocked(roleFromClaims).mock.calls.length;
    expect((await signInThrough(connection.id, claimsOf())).response.status).toBe(302);
    expect(vi.mocked(roleFromClaims).mock.calls).toHaveLength(asked);
    expect(await membershipsOf(user.id)).toMatchObject([{ role: adminRole }]);
  });

  it('with provisioning off, only an invited address gets an account, and the invitation keeps its role', async () => {
    const { organization, connection } = await seedConnection({ jitProvisioning: false });

    await expectRefusal(await signInThrough(connection.id), 403, 'sign_up_restricted');
    expect(await getUserByEmail(studentEmail)).toHaveLength(0);

    const inviter = await createUser('teacher@hu.nl');
    const { inactiveMembership } = await createInvitation({ organization, email: studentEmail, createdBy: inviter.id, role: adminRole });

    const { response } = await signInThrough(connection.id);
    expect(response.status).toBe(302);
    const [user] = await getUserByEmail(studentEmail);

    // The invitation into the organization is bound to the new account and names the role; the sign-in grants no membership of its own.
    const [bound] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(bound.userId).toBe(user.id);
    expect(await membershipsOf(user.id)).toHaveLength(0);
  });

  it('a start at the federation itself resolves the connection from the asserted institution', async () => {
    const { connection } = await seedConnection();

    const { response: started } = await call(startSsoFederation, { path: { federation: 'surfconext' }, query: {}, headers: defaultHeaders });
    expect(started.status).toBe(302);
    expect(new URL(started.headers.get('location') ?? '').searchParams.get('login_hint')).toBeNull();
    const state = stateOf(started);
    expect(statePayload(state).connectionId).toBeUndefined();

    const { response } = await finish(state, claimsOf());
    expect(response.status).toBe(302);
    const [user] = await getUserByEmail(studentEmail);
    expect((await identitiesOf(user.id))[0].connectionId).toBe(connection.id);

    const { response: unconnected } = await call(startSsoFederation, { path: { federation: 'surfconext' }, query: {}, headers: defaultHeaders });
    await expectRefusal(
      await finish(stateOf(unconnected), claimsOf({ schac_home_organization: 'uu.nl', email: 'x@uu.nl' })),
      403,
      'sso_wrong_institution',
    );

    await expectRefusal(await call(startSsoFederation, { path: { federation: 'nowhere' }, query: {}, headers: defaultHeaders }), 404, 'not_found');
  });

  describe('connect: the institution account of a signed-in user', () => {
    /** The pin startOAuthConnect leaves: a token for the user and the session that asked, its raw value in this browser's cookie. */
    const pinConnect = async (user: { id: string; email: string }) => {
      const { id: sessionId } = await insertTestSession(user, { expiresInMs: 60 * 60 * 1000 });
      const pin = await insertTestToken('oauth-connect', user, { sessionId, expiresInMs: 10 * 60 * 1000 });
      mockCookieStore.set('oauth-connect', pin.raw);
      vi.mocked(resolveSession).mockResolvedValueOnce({ user: { id: user.id }, session: { id: sessionId } } as never);
    };

    it('links the identity, proves the asserted address and grants membership in the institution’s organization', async () => {
      const { organization, connection } = await seedConnection();
      const user = await createUser('l.jansen@hu.nl');
      await pinConnect(user);

      const started = (await start(connection.id, { type: 'connect' })).response;
      expect(started.status).toBe(302);
      const { response } = await finish(stateOf(started), claimsOf({ email: 'lars@student.hu.nl', sub: 'lars-subject' }));

      expect(response.status).toBe(302);
      expect(cookieChange(response, 'session')).toBe('set');
      expect(await identitiesOf(user.id)).toMatchObject([
        { kind: 'sso', issuer: 'surfconext', subject: 'lars-subject', verified: true, connectionId: connection.id },
      ]);
      // The institution operates the mailbox it asserts: the address joins the account's ledger.
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, 'lars@student.hu.nl'))).toMatchObject([
        { userId: user.id, lastVerifiedVia: 'surfconext' },
      ]);
      expect(await membershipsOf(user.id)).toMatchObject([{ channelId: organization.id, role: memberRole }]);
      expect(lastSessionCall()).toEqual(['surfconext', 'regular', { connectionId: connection.id }]);
    });

    it('grants the membership of a connect with the role the seam gives', async () => {
      const { organization, connection } = await seedConnection();
      const user = await createUser('l.jansen@hu.nl');
      await pinConnect(user);
      vi.mocked(roleFromClaims).mockReturnValueOnce(adminRole);

      const started = (await start(connection.id, { type: 'connect' })).response;
      expect((await finish(stateOf(started), claimsOf({ email: 'l.jansen@hu.nl' }))).response.status).toBe(302);

      expect(await membershipsOf(user.id)).toMatchObject([{ channelId: organization.id, role: adminRole }]);
    });

    it('refuses an institution account that belongs to another user, and a connect without a pin', async () => {
      const { connection } = await seedConnection();
      const holder = await createUser('holder@hu.nl');
      await linkIdentity(holder, { kind: 'sso', issuer: 'surfconext', subject, connectionId: connection.id });

      const user = await createUser('l.jansen@hu.nl');
      await pinConnect(user);
      const started = (await start(connection.id, { type: 'connect' })).response;
      await expectRefusal(await finish(stateOf(started), claimsOf()), 409, 'oauth_conflict');
      expect(await identitiesOf(user.id)).toHaveLength(0);

      expect((await start(connection.id, { type: 'connect' })).response.status).toBe(401);
    });
  });

  describe('recovery: the asserted address already has an account', () => {
    beforeAll(() => setTestConfig({ enabledAuthStrategies: ['passkey', 'magic', 'sso'] }));
    afterAll(() => setTestConfig({ enabledAuthStrategies: ['passkey', 'sso'] }));

    const recover = () => call(sendSsoRecoveryLink, { headers: defaultHeaders });
    const magicTokensOf = (userId: string) => db.select().from(tokensTable).where(eq(tokensTable.userId, userId));
    const requireSso = (tenantId: string) =>
      db
        .update(tenantsTable)
        .set({ authStrategies: ['surfconext'] as never })
        .where(eq(tenantsTable.id, tenantId));

    it('offers one sign-in link to that address, which returns to connect the institution account', async () => {
      const { connection } = await seedConnection();
      const user = await createUser(studentEmail);

      // Nothing to recover from before a sign-in at the institution collided.
      await expectRefusal(await recover(), 401, 'sso_recovery_expired');

      await expectRefusal(await signInThrough(connection.id), 409, 'sso_email_exists');
      const sent = await recover();

      expect(sent.response.status).toBe(200);
      expect(sent.data).toEqual({ email: studentEmail });
      expect(await magicTokensOf(user.id)).toMatchObject([
        { type: 'magic', email: studentEmail, redirectPath: `/account?connect=${connection.id}#authentication` },
      ]);

      // Spent by asking: another link takes another sign-in at the institution.
      await expectRefusal(await recover(), 401, 'sso_recovery_expired');
      expect(await magicTokensOf(user.id)).toHaveLength(1);
    });

    it('keeps the offer while magic links are switched off', async () => {
      const { connection } = await seedConnection();
      await createUser(studentEmail);
      await expectRefusal(await signInThrough(connection.id), 409, 'sso_email_exists');

      setTestConfig({ enabledAuthStrategies: ['passkey', 'sso'] });
      await expectRefusal(await recover(), 400, 'forbidden_strategy');
      setTestConfig({ enabledAuthStrategies: ['passkey', 'magic', 'sso'] });

      expect((await recover()).response.status).toBe(200);
    });

    it('recovers an account whose identifier at the institution changed, even where the tenant requires SSO', async () => {
      const { organization, connection } = await seedConnection();
      const user = await createUser(studentEmail);
      await linkIdentity(user, { kind: 'sso', issuer: 'surfconext', subject: 'the-subject-before', connectionId: connection.id });
      await db.update(emailsTable).set({ lastVerifiedVia: 'surfconext' }).where(eq(emailsTable.email, studentEmail));
      await requireSso(organization.tenantId);

      // The institution proved the address and its tenant excludes magic links: the address sends none on request.
      await expectRefusal(await call(sendMagicLink, { body: { email: studentEmail }, headers: defaultHeaders }), 403, 'sso_required');

      // The same person under a new subject collides with their own account; having signed in there, the link goes out.
      await expectRefusal(await signInThrough(connection.id), 409, 'sso_email_exists');
      expect((await recover()).response.status).toBe(200);
      expect(await magicTokensOf(user.id)).toMatchObject([{ type: 'magic', email: studentEmail }]);
    });

    it('does not lift the policy for a sign-in through another institution', async () => {
      const { organization, connection } = await seedConnection();
      const other = await seedConnection({ displayName: 'Universiteit Utrecht', claimValues: ['uu.nl'] });
      const user = await createUser(studentEmail);
      await linkIdentity(user, { kind: 'sso', issuer: 'surfconext', subject: 'the-subject-before', connectionId: connection.id });
      await db.update(emailsTable).set({ lastVerifiedVia: 'surfconext' }).where(eq(emailsTable.email, studentEmail));
      await requireSso(organization.tenantId);

      // An account at another connected institution that asserts the same address.
      const refused = await signInThrough(other.connection.id, claimsOf({ sub: 'someone-at-uu', schac_home_organization: 'uu.nl' }));
      await expectRefusal(refused, 409, 'sso_email_exists');

      await expectRefusal(await recover(), 403, 'sso_required');
      expect(await magicTokensOf(user.id)).toHaveLength(0);
    });
  });
});
