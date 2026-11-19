import { and, eq, inArray } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createLtiRegistrationLink,
  createLtiResourceLink,
  getMe,
  listLtiContexts,
  startLtiLaunch,
  startLtiToolRegistration,
  updateLtiInstallation,
} from 'sdk';
import { type AccessScope, appConfig, buildSubjectFromEntity, checkAccess, hierarchy } from 'shared';
import { embeddedSessionHeader } from 'shared/utils/embedded-session';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { lisContextRoles } from '#/lib/lti-vocabulary';
import { getPgBoss } from '#/lib/pg-boss';
import { maxMembersPages } from '#/modules/auth/flows/lti/helpers/platform-api';
import { ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import { ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';
import { upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { importLtiMembersOp, ltiMemberImportQueue } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { connectionsTable, isLtiConnection } from '#/modules/connections/connections-db';
import { ltiPlatformConfiguration } from '#/modules/lti-platform/helpers/platform-offer';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { countTakenSeats } from '#/modules/memberships/operations/organization-seats';
import { currentSigningKey, ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { identitiesTable } from '#/modules/user/identities-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
import { createTestOrganization, expectRefusal } from './helpers';
import { decodeHtml, parseForm, startTestOauthServer, type TestOauthServer } from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser, orgMembershipOf } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// An app may map an LTI role to any role it has: the import keeps an absent person below elevated roles, whatever the mapping.
vi.mock('#/modules/auth/flows/lti/lti-context-channel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/flows/lti/lti-context-channel')>();
  return { ...actual, ltiContextRole: vi.fn(actual.ltiContextRole) };
});

// Every client assertion the app signs takes its key here: an attack test sees whether one was signed.
vi.mock('#/modules/oauth-server/keystore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/oauth-server/keystore')>();
  return { ...actual, currentSigningKey: vi.fn(actual.currentSigningKey) };
});

// The app takes both LTI roles: the round trip imports the people of one tenant into another.
setTestConfig({ enabledAuthStrategies: ['passkey', 'lti'] });
overrideConfig(appConfig.has, { ltiPlatform: true });

const loopback = async () => [{ address: '127.0.0.1', family: 4 }];

/** The platform storage exchange a login page carries in its body. */
const pageExchange = (page: string): { key: string; value?: string; next?: string } =>
  JSON.parse(decodeHtml(/data-exchange="([^"]*)"/.exec(page)?.[1] ?? '{}'));

type MemberRow = { id: string; roles: string[]; name?: string };

/** A platform built on the template, answered in-process: a token named after the assertion's client, and the pages `page` answers. */
function fakePlatformApi(page: (url: URL) => { results: MemberRow[]; nextPageToken?: string }, tokenError?: string) {
  const requests: { url: URL; authorization?: string }[] = [];
  let minted = 0;
  const transport: GuardedTransport = async ({ url, headers, body }) => {
    requests.push({ url, authorization: headers.Authorization });
    if (url.pathname === '/token') {
      if (tokenError) return Response.json({ error: tokenError }, { status: 400 });
      minted += 1;
      const clientId = decodeJwt(new URLSearchParams(body).get('client_assertion') ?? '').sub;
      return Response.json({ access_token: `${clientId}:${minted}`, token_type: 'Bearer', expires_in: 3600 });
    }
    return Response.json(page(url));
  };
  const memberReads = () => requests.filter(({ url }) => url.pathname.endsWith('/lti-members'));
  return { options: { transport, resolve: loopback }, requests, memberReads };
}

describe('LTI member import from a platform built on the template', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const send = vi.mocked((await getPgBoss('producer')).send);
  const fetchApp = (path: string, init?: RequestInit) => baseApp.fetch(new Request(`http://localhost${path}`, init));

  beforeAll(async () => await ensureSigningKeys());
  afterEach(async () => await clearSecurityTestData());

  /** An organization of its own with an admin, as each side of a connection is. */
  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, adminRole);
    const path = { tenantId: org.tenantId, organizationId: org.id };
    return { org, admin, path, headers: { ...defaultHeaders, Cookie: admin.sessionCookie } };
  }

  /**
   * A tenant connected to a platform at `issuer`, with a context of its organization whose launch named the platform's
   * API. `stored` replaces addresses as a connection or a launch stored them before the app checked them.
   */
  async function connectToFakePlatform(
    issuer = 'https://platform-a.example.com',
    clientId = `client-${nanoid(6)}`,
    stored: { tokenEndpoint?: string; authorizationServer?: string; apiUrl?: string } = {},
  ) {
    const side = await orgWithAdmin();
    const [connection] = await db
      .insert(connectionsTable)
      .values({
        tenantId: side.org.tenantId,
        kind: 'lti',
        issuer,
        clientId,
        name: new URL(issuer).host,
        status: 'active',
        config: {
          authorizationEndpoint: `${issuer}/authorize`,
          tokenEndpoint: stored.tokenEndpoint ?? `${issuer}/token`,
          ...(stored.authorizationServer && { authorizationServer: stored.authorizationServer }),
          jwksUri: `${issuer}/jwks`,
          productFamilyCode: 'test',
          version: '1',
          deploymentIds: ['deployment-1'],
        },
      })
      .returning();
    const apiUrl = stored.apiUrl ?? `${issuer}/api/tenants/platform-tenant`;
    const context = await upsertLtiContext(
      { var: { db } },
      {
        values: {
          tenantId: side.org.tenantId,
          organizationId: side.org.id,
          connectionId: connection.id,
          contextId: 'course-1',
          types: [],
          channelType: 'organization',
          channelId: side.org.id,
          apiUrl,
          membersUrl: `${apiUrl}/organizations/platform-org/lti-members?channelType=organization&channelId=platform-org`,
        },
        by: side.admin.id,
      },
    );
    return { ...side, issuer, clientId, connection, context };
  }

  const contextRow = async (id: string) => (await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.id, id)))[0];

  /** Sets the tenant's member limit to the seats its organization holds now, plus `free`. */
  const limitSeats = async ({ org }: { org: { id: string; tenantId: string } }, free: number) => {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, org.tenantId));
    const user = (await countTakenSeats({ var: { db } }, { organizationId: org.id })) + free;
    await db
      .update(tenantsTable)
      .set({ restrictions: { ...tenant.restrictions, quotas: { ...tenant.restrictions.quotas, user } } })
      .where(eq(tenantsTable.id, tenant.id));
  };
  const ltiIdentities = (issuer: string) =>
    db
      .select()
      .from(identitiesTable)
      .where(and(eq(identitiesTable.kind, 'lti'), eq(identitiesTable.provider, issuer)));

  describe('as one app that is both sides', () => {
    let oauth: TestOauthServer;

    beforeAll(async () => {
      oauth = await startTestOauthServer();
    });
    afterAll(async () => await oauth.close());

    /**
     * The platform's addresses, answered in-process: the API by the app, and the authorization server by the test
     * listener. Its configuration is read as if at its public address. A token request arrives at the listener's own
     * address, as behind a proxy that forwards no host: only an assertion addressed to the issuer passes there.
     */
    const platformTransport: GuardedTransport = ({ url, method, headers, body }) => {
      if (url.href.startsWith(appConfig.backendUrl))
        return Promise.resolve(baseApp.request(`${url.pathname}${url.search}`, { method, headers, body }));
      const publicAddress = new URL(appConfig.oauthUrl);
      const forwarded: Record<string, string> = url.pathname.endsWith('/token')
        ? {}
        : { 'X-Forwarded-Host': publicAddress.host, 'X-Forwarded-Proto': publicAddress.protocol.replace(':', '') };
      return fetch(new URL(`${url.pathname}${url.search}`, oauth.issuer), {
        method,
        headers: { ...headers, ...forwarded },
        body,
        redirect: 'manual',
      });
    };
    const platformOptions = { transport: platformTransport, resolve: loopback };

    /** Tenant A as the platform with its members, tenant B registered there as an LTI tool and placed in A's organization. */
    async function connectThroughRegistration({ grantedScopes = ['user:read'] }: { grantedScopes?: AccessScope[] } = {}) {
      const toolSide = await orgWithAdmin();
      const platformSide = await orgWithAdmin();
      const learners = await Promise.all(
        [1, 2].map(() => createFactorOrgUser(call, platformSide.org.tenantId, platformSide.org.id, `lti-${nanoid(8)}`, memberRole)),
      );

      const link = await call(createLtiRegistrationLink, { path: toolSide.path, headers: toolSide.headers });
      const started = await call(startLtiToolRegistration, {
        path: platformSide.path,
        body: { registrationUrl: (link.data as { url: string }).url },
        headers: platformSide.headers,
      });
      const registrationUrl = new URL((started.data as { url: string }).url);
      const connection = await registerLtiPlatformOp(
        {
          link: registrationUrl.searchParams.get('link') ?? '',
          openid_configuration: registrationUrl.searchParams.get('openid_configuration') ?? '',
          registration_token: registrationUrl.searchParams.get('registration_token') ?? undefined,
        },
        platformOptions,
      );
      if (!isLtiConnection(connection)) throw new Error('the registration stored no LTI connection');
      // Each side reads the other's key set at the worker's own listener in a test.
      await db
        .update(connectionsTable)
        .set({ config: { ...connection.config, jwksUri: `${oauth.issuer}/jwks` } })
        .where(eq(connectionsTable.id, connection.id));
      await db
        .update(oauthClientsTable)
        .set({ jwksUri: `${oauth.issuer}/jwks` })
        .where(eq(oauthClientsTable.id, connection.clientId));

      const [installationId] = connection.config.deploymentIds;
      await call(approveLtiInstallation, {
        path: { ...platformSide.path, ltiInstallationId: installationId },
        body: { releasedFields: ['name'], grantedScopes },
        headers: platformSide.headers,
      });
      const placed = await call(createLtiResourceLink, {
        path: platformSide.path,
        body: { channelType: 'organization', channelId: platformSide.org.id, installationId, title: 'Tool side' },
        headers: platformSide.headers,
      });
      return { toolSide, platformSide, learners, connection, resourceLinkId: (placed.data as { id: string }).id };
    }

    type Connected = Awaited<ReturnType<typeof connectThroughRegistration>>;

    /** A launch of the placement by the person `cookie` signs in, played through both sides as the browser plays it. */
    async function launch({ platformSide, resourceLinkId }: Connected, cookie: string) {
      const started = await call(startLtiLaunch, {
        path: { ...platformSide.path, ltiResourceLinkId: resourceLinkId },
        headers: { ...defaultHeaders, Cookie: cookie },
      });
      const startToken = new URL((started.data as { url: string }).url).searchParams.get('token') ?? '';
      const initiation = parseForm(await (await fetchApp(`/lti-launches/~initiate-login?token=${startToken}`)).text());
      const loginPage = await fetchApp('/auth/lti/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: new URL(appConfig.oauthUrl).origin },
        body: new URLSearchParams(initiation.fields),
      });
      const stored = pageExchange(await loginPage.text());
      const answer = parseForm(await (await fetch(`${oauth.issuer}/lti/authorize${new URL(stored.next ?? '').search}`)).text());
      const launchPage = await fetchApp('/auth/lti/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: new URL(appConfig.oauthUrl).origin },
        body: new URLSearchParams(answer.fields),
      });
      const posted = parseForm(await launchPage.text());
      const finished = await fetchApp('/auth/lti/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: appConfig.frontendUrl, 'Sec-Fetch-Site': 'same-origin' },
        body: new URLSearchParams({ id_token: posted.fields.id_token, state: posted.fields.state, storage_value: stored.value ?? '' }),
      });
      expect(finished.status).toBe(303);
      const embedded =
        finished.headers
          .getSetCookie()
          .find((cookie) => cookie.includes('-embedded-session-'))
          ?.split(';')[0] ?? '';
      const me = await call(getMe, { headers: { Cookie: embedded, [embeddedSessionHeader]: '1' } });
      return (me.data as { user: { id: string } }).user.id;
    }

    /** What an import may write in the LTI tool's tenant: the imported identities and accounts, and its organization's memberships. */
    const toolSideState = async ({ toolSide }: Connected) => ({
      identities: await db
        .select({ subject: identitiesTable.subject, userId: identitiesTable.userId, email: identitiesTable.email, name: usersTable.name })
        .from(identitiesTable)
        .innerJoin(usersTable, eq(usersTable.id, identitiesTable.userId))
        .where(and(eq(identitiesTable.kind, 'lti'), eq(identitiesTable.provider, appConfig.oauthUrl)))
        .orderBy(identitiesTable.subject),
      memberships: await db
        .select({ userId: membershipsTable.userId, role: membershipsTable.role, updatedAt: membershipsTable.updatedAt })
        .from(membershipsTable)
        .where(eq(membershipsTable.channelId, toolSide.org.id))
        .orderBy(membershipsTable.userId),
    });

    // Contract: an LTI tool on the template reads a course's people from a platform on the template before they launch.
    it("imports the platform's people after a teacher's launch, as the accounts their own launches then sign into, and changes nothing on a second run", async () => {
      const connected = await connectThroughRegistration();
      const { toolSide, platformSide, learners, connection } = connected;
      expect(connection.config.authorizationServer).toBe(appConfig.oauthUrl);

      await launch(connected, platformSide.admin.sessionCookie);
      const [context] = await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, connection.id));
      expect(context.membersUrl).toContain(`/organizations/${platformSide.org.id}/lti-members`);
      expect(send).toHaveBeenCalledWith(ltiMemberImportQueue.name, { contextId: context.id }, { singletonKey: context.id });

      await importLtiMembersOp(context.id, platformOptions);
      expect(await contextRow(context.id)).toMatchObject({ importReadCount: 3, importIssue: null });

      const people = [platformSide.admin, ...learners];
      const names = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(
          inArray(
            usersTable.id,
            people.map(({ id }) => id),
          ),
        );
      const imported = await toolSideState(connected);
      expect(imported.identities).toEqual(
        names
          .map(({ id, name }) => ({ subject: id, userId: expect.any(String), email: null, name }))
          .sort((a, b) => a.subject.localeCompare(b.subject)),
      );
      for (const { subject, userId } of imported.identities) {
        expect(people.map(({ id }) => id)).not.toContain(userId);
        const ltiRoles = [subject === platformSide.admin.id ? lisContextRoles.instructor : lisContextRoles.learner];
        expect(await orgMembershipOf(userId, toolSide.org.id)).toMatchObject({ role: ltiContextRole({ ltiRoles, connection }) });
      }

      const learnerAccount = imported.identities.find(({ subject }) => subject === learners[0].id)?.userId;
      expect(await launch(connected, learners[0].sessionCookie)).toBe(learnerAccount);

      const before = await toolSideState(connected);
      await importLtiMembersOp(context.id, platformOptions);
      expect(await toolSideState(connected)).toEqual(before);
    });

    // Normal state: an admin who granted nothing names no API in a launch, and one who withdraws the grant later leaves
    // the import without a token; either way the LTI tool's tenant stays as it was.
    it('stores no API without a grant, records a grant withdrawn since, and makes no account', async () => {
      const ungranted = await connectThroughRegistration({ grantedScopes: [] });
      await launch(ungranted, ungranted.platformSide.admin.sessionCookie);
      const [stored] = await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, ungranted.connection.id));
      expect(stored).toMatchObject({ apiUrl: null, membersUrl: null });

      const connected = await connectThroughRegistration();
      const { platformSide } = connected;
      await launch(connected, platformSide.admin.sessionCookie);
      const [installationId] = connected.connection.config.deploymentIds;
      const path = { ...platformSide.path, ltiInstallationId: installationId };
      await call(updateLtiInstallation, { path, body: { grantedScopes: [] }, headers: platformSide.headers });
      const [context] = await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, connected.connection.id));
      const before = await toolSideState(connected);

      await importLtiMembersOp(context.id, platformOptions);
      expect(await contextRow(context.id)).toMatchObject({ importReadCount: 0, importIssue: 'scope_not_granted' });
      expect(await toolSideState(connected)).toEqual(before);
    });
  });

  // Attack: an LTI administrator administers their LMS, not this organization, and is not present to be asked.
  it('gives a person the platform lists as Administrator no organization role that may update the organization, whatever the mapping answers', async () => {
    const top = hierarchy.getMostPrivilegedRole('organization');
    vi.mocked(ltiContextRole).mockImplementation(({ ltiRoles }) => (ltiRoles.includes(lisContextRoles.administrator) ? top : memberRole));
    try {
      const side = await connectToFakePlatform();
      const api = fakePlatformApi(() => ({ results: [{ id: 'lms-admin', roles: [lisContextRoles.administrator], name: 'Grace Hopper' }] }));
      await importLtiMembersOp(side.context.id, api.options);

      const [identity] = await ltiIdentities(side.issuer);
      const { role } = await orgMembershipOf(identity.userId, side.org.id);
      const access = {
        actorId: identity.userId,
        scopes: null,
        memberships: [{ channelType: 'organization' as const, channelId: side.org.id, role }],
      };
      expect(checkAccess(access, 'update', buildSubjectFromEntity('organization', side.org)).allowed).toBe(false);
    } finally {
      vi.mocked(ltiContextRole).mockReset();
    }
  });

  // Attack: the platform decides whom it lists, never whom the organization loses or how far anyone already in it falls.
  it('lowers no organization role and removes no one, listed or not', async () => {
    const side = await connectToFakePlatform();
    const unlisted = await createFactorOrgUser(call, side.org.tenantId, side.org.id, `lti-${nanoid(8)}`, memberRole);
    await db.insert(identitiesTable).values({ userId: side.admin.id, kind: 'lti', provider: side.issuer, subject: 'lms-teacher', email: null });
    const api = fakePlatformApi(() => ({
      results: [
        { id: 'lms-teacher', roles: [lisContextRoles.learner] },
        { id: 'lms-student', roles: [lisContextRoles.learner] },
      ],
    }));
    const before = await db.select().from(membershipsTable).where(eq(membershipsTable.channelId, side.org.id));

    await importLtiMembersOp(side.context.id, api.options);
    const after = await db.select().from(membershipsTable).where(eq(membershipsTable.channelId, side.org.id));
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after).toHaveLength(before.length + 1);
    expect(await orgMembershipOf(side.admin.id, side.org.id)).toMatchObject({ role: adminRole });
    expect(await orgMembershipOf(unlisted.id, side.org.id)).toMatchObject({ role: memberRole });
  });

  // Attack: a platform that never ends its list holds no import, and no worker, for long. The bound on pages bounds the
  // rows too: a page holds at most the rows the import asks for.
  it('stops reading at the bound of a platform that lists without end', async () => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi((url) => ({
      results: Array.from({ length: Number(url.searchParams.get('maxPageSize')) }, (_, index) => ({
        id: `lms-${index % 3}`,
        roles: [lisContextRoles.learner],
      })),
      nextPageToken: 'more',
    }));

    await importLtiMembersOp(side.context.id, api.options);
    expect(api.memberReads()).toHaveLength(maxMembersPages);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 3, importIssue: 'too_many_members' });
  });

  // One seat rule for invitations, launches and imports: whoever needs a seat when none is left stays out, and the
  // rest go on. Attack: a name the platform lists never replaces the name of an account someone signs in to.
  it('leaves out who needs a seat at the member limit, goes on with the rest, and names only a placeholder account', async () => {
    const side = await connectToFakePlatform();
    await db.insert(identitiesTable).values({ userId: side.admin.id, kind: 'lti', provider: side.issuer, subject: 'lms-teacher', email: null });
    await importLtiMembersOp(side.context.id, fakePlatformApi(() => ({ results: [{ id: 'lms-early', roles: [lisContextRoles.learner] }] })).options);
    const [early] = await ltiIdentities(side.issuer).then((rows) => rows.filter(({ subject }) => subject === 'lms-early'));
    const named = async (userId: string) => (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)))[0].name;
    const adminName = await named(side.admin.id);

    await limitSeats(side, 0);
    const api = fakePlatformApi(() => ({
      results: [
        { id: 'lms-new', roles: [lisContextRoles.learner], name: 'Ada Lovelace' },
        { id: 'lms-early', roles: [lisContextRoles.learner], name: 'Grace Hopper' },
        { id: 'lms-teacher', roles: [lisContextRoles.instructor], name: 'Someone Else' },
      ],
    }));
    await importLtiMembersOp(side.context.id, api.options);

    expect((await ltiIdentities(side.issuer)).map(({ subject }) => subject).sort()).toEqual(['lms-early', 'lms-teacher']);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 3, importIssue: 'member_limit' });
    expect(await named(early.userId)).toBe('Grace Hopper');
    expect(await named(side.admin.id)).toBe(adminName);
  });

  // Attack: two tenants registered at one platform share its API address, never each other's token.
  it('sends each connection only its own token, though both read one API', async () => {
    const issuer = 'https://platform-a.example.com';
    const first = await connectToFakePlatform(issuer, 'client-first');
    const second = await connectToFakePlatform(issuer, 'client-second');
    const api = fakePlatformApi(() => ({ results: [{ id: 'lms-student', roles: [lisContextRoles.learner] }] }));

    await importLtiMembersOp(first.context.id, api.options);
    const firstReads = api.memberReads().length;
    await importLtiMembersOp(second.context.id, api.options);

    const reads = api.memberReads();
    expect(reads.slice(0, firstReads).every(({ authorization }) => authorization?.startsWith('Bearer client-first:'))).toBe(true);
    expect(reads.slice(firstReads).length).toBeGreaterThan(0);
    expect(reads.slice(firstReads).every(({ authorization }) => authorization?.startsWith('Bearer client-second:'))).toBe(true);
  });

  // Attack: the app signs with one key for every platform. Someone who registers a platform of their own names the
  // victim platform as the audience of the assertion and its own host as the token endpoint, to receive an assertion
  // the victim accepts; or names the victim's token endpoint and a course there, to read its people into their own
  // organization. Registration refuses both, and a connection stored before that signs nothing and sends nothing.
  describe('a platform that names another host than its issuer for its token', () => {
    const attacker = 'https://attacker.example.com';
    const victim = 'https://victim.example.com';
    const variants = [
      {
        name: 'its own token endpoint and the victim as the audience',
        tokenEndpoint: `${attacker}/token`,
        authorizationServer: victim,
        apiUrl: undefined,
      },
      {
        name: "the victim's token endpoint and a course there",
        tokenEndpoint: `${victim}/token`,
        authorizationServer: undefined,
        apiUrl: `${victim}/api/tenants/victim`,
      },
    ];

    it.each(variants)('refuses to register a platform that names $name', async ({ tokenEndpoint, authorizationServer }) => {
      const side = await orgWithAdmin();
      const link = await call(createLtiRegistrationLink, { path: side.path, headers: side.headers });
      const requests: URL[] = [];
      const transport: GuardedTransport = async ({ url }) => {
        requests.push(url);
        if (url.pathname === '/register') return Response.json({ client_id: 'victim-client' }, { status: 201 });
        const configuration = ltiPlatformConfiguration({ jwksUri: `${attacker}/jwks`, tokenEndpoint });
        return Response.json({
          ...configuration,
          issuer: attacker,
          authorization_endpoint: `${attacker}/authorize`,
          registration_endpoint: `${attacker}/register`,
          authorization_server: authorizationServer,
        });
      };
      vi.mocked(currentSigningKey).mockClear();

      const registering = registerLtiPlatformOp(
        { link: new URL((link.data as { url: string }).url).searchParams.get('link') ?? '', openid_configuration: `${attacker}/lti/configuration` },
        { transport, resolve: loopback },
      );
      await expect(registering).rejects.toMatchObject({ status: 400, type: 'lti_configuration_invalid' });
      expect(requests.map(({ href }) => href)).toEqual([`${attacker}/lti/configuration`]);
      expect(currentSigningKey).not.toHaveBeenCalled();
      expect(await db.select().from(connectionsTable).where(eq(connectionsTable.issuer, attacker))).toEqual([]);
    });

    it.each(variants)('signs nothing and sends nothing for a connection stored with $name', async (stored) => {
      const side = await connectToFakePlatform(attacker, 'victim-client', stored);
      const api = fakePlatformApi(() => ({ results: [{ id: 'lms-student', roles: [lisContextRoles.learner] }] }));
      vi.mocked(currentSigningKey).mockClear();

      await importLtiMembersOp(side.context.id, api.options);
      expect(api.requests).toEqual([]);
      expect(currentSigningKey).not.toHaveBeenCalled();
      expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 0, importIssue: 'address_refused' });
      expect(await ltiIdentities(attacker)).toEqual([]);
    });
  });

  // Attack: a course list tells which platforms an organization trusts and how its imports ran; it is for whoever may update the organization.
  it("lists the courses of the organization's own connections, and refuses a member and another tenant's admin", async () => {
    const own = await connectToFakePlatform();
    const other = await connectToFakePlatform('https://platform-b.example.com');
    await importLtiMembersOp(own.context.id, fakePlatformApi(() => ({ results: [{ id: 'lms-student', roles: [lisContextRoles.learner] }] })).options);

    const listed = await call(listLtiContexts, { path: own.path, headers: own.headers });
    expect((listed.data as { results: unknown[] }).results).toEqual([
      expect.objectContaining({ id: own.context.id, channel: expect.objectContaining({ id: own.org.id }), importReadCount: 1, importIssue: null }),
    ]);

    const member = await createFactorOrgUser(call, own.org.tenantId, own.org.id, `lti-${nanoid(8)}`, memberRole);
    await expectRefusal(
      await call(listLtiContexts, { path: own.path, headers: { ...defaultHeaders, Cookie: member.sessionCookie } }),
      403,
      'forbidden',
    );
    await expectRefusal(await call(listLtiContexts, { path: own.path, headers: other.headers }), 403, 'forbidden');
  });
});
