import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getRequestListener } from '@hono/node-server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { decodeJwt, importJWK, type JWK, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createApiKey,
  createLtiRegistrationLink,
  createLtiResourceLink,
  deleteLtiConnection,
  getMe,
  listLtiContexts,
  listServiceAccounts,
  startLtiLaunch,
  startLtiToolRegistration,
  updateLtiInstallation,
  updateServiceAccount,
} from 'sdk';
import { type AccessScope, appConfig, buildSubjectFromEntity, checkAccess, hierarchy } from 'shared';
import { embeddedSessionHeader } from 'shared/utils/embedded-session';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { lisContextRoles, lisInstitutionRoles, ltiNrps } from '#/lib/lti-vocabulary';
import { getPgBoss } from '#/lib/pg-boss';
import { sessionsTable } from '#/modules/auth/core/sessions/sessions-db';
import { mintConnectionKey } from '#/modules/auth/flows/lti/helpers/connection-key';
import { maxMembersPages } from '#/modules/auth/flows/lti/helpers/platform-memberships';
import { ltiKeySetUrl } from '#/modules/auth/flows/lti/helpers/registration-request';
import { ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import { ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';
import { upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { ltiRoleIn } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import { connectionServiceAccountId } from '#/modules/auth/flows/lti/operations/connection-service-account';
import {
  importLtiMembersOp,
  ltiMemberImportQueue,
  maxCoursesPerHour,
  maxPeoplePerHour,
  requestLtiMemberImport,
  takeFromImportBudget,
} from '#/modules/auth/flows/lti/operations/import-lti-members';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { connectionsTable, isLtiConnection } from '#/modules/connections/connections-db';
import { holdConnection } from '#/modules/connections/connections-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { countTakenSeats } from '#/modules/memberships/operations/organization-seats';
import { ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { identitiesTable } from '#/modules/user/identities-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
import { createTestOrganization, expectRefusal } from './helpers';
import {
  canvasMember,
  canvasMemberPage,
  canvasPlatform,
  moodleMember,
  moodleMemberPage,
  moodlePlatform,
  type PlatformFixture,
} from './lti-platform-fixtures';
import { decodeHtml, parseForm, startTestOauthServer, type TestOauthServer } from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser, orgMembershipOf } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are. An app may map an
// LTI role to any role it has: the import keeps an absent person below elevated roles, whatever the mapping.
vi.mock('#/modules/auth/flows/lti/lti-context-channel', async (importOriginal) => {
  const template = (await import('./lti-template-answers')).templateLtiContextChannel(await importOriginal());
  return { ...template, ltiContextRole: vi.fn(template.ltiContextRole) };
});
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

// The app takes both LTI roles: the round trip imports the people of one tenant into another.
setTestConfig({ enabledAuthStrategies: ['passkey', 'lti'] });
overrideConfig(appConfig.has, { ltiPlatform: true });

const loopback = async () => [{ address: '127.0.0.1', family: 4 }];

/** The platform storage exchange a login page carries in its body. */
const pageExchange = (page: string): { key: string; value?: string; next?: string } =>
  JSON.parse(decodeHtml(/data-exchange="([^"]*)"/.exec(page)?.[1] ?? '{}'));

type Member = { user_id: string; roles: string[]; status?: string; name?: string; given_name?: string; family_name?: string };
/** A page of a fake platform: its members and the next page's address, or the answer as the platform sends it. */
type Page = { members: Member[]; next?: string } | Response;

/**
 * A platform answered in-process: a token named after the assertion's client, and the pages `page` answers as NRPS
 * membership containers. It records each request with the token request's params.
 */
function fakePlatformApi(page: (url: URL) => Page | Promise<Page>, tokenError?: string) {
  const requests: { url: URL; authorization?: string; accept?: string; params?: URLSearchParams }[] = [];
  let minted = 0;
  const transport: GuardedTransport = async ({ url, method, headers, body }) => {
    const params = method === 'POST' ? new URLSearchParams(body) : undefined;
    requests.push({ url, authorization: headers.Authorization, accept: headers.Accept, params });
    if (params) {
      if (tokenError) return Response.json({ error: tokenError }, { status: 400 });
      minted += 1;
      return Response.json({
        access_token: `${decodeJwt(params.get('client_assertion') ?? '').sub}:${minted}`,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    }
    const answer = await page(url);
    if (answer instanceof Response) return answer;
    const container = { id: url.href, context: { id: 'course-1' }, members: answer.members };
    return Response.json(container, { headers: { 'Content-Type': ltiNrps.mediaType, ...(answer.next && { Link: `<${answer.next}>; rel="next"` }) } });
  };
  const memberReads = () => requests.filter(({ params }) => !params);
  return { options: { transport, resolve: loopback }, requests, memberReads };
}

describe('LTI member import by Names and Role Provisioning Services', async () => {
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

  interface FakeConnection {
    issuer?: string;
    clientId?: string;
    /** A connection registered before keys were made per connection holds none. */
    keyless?: boolean;
  }

  /** A tenant connected to a platform at `issuer`, with a context of its organization whose launch named its membership address. */
  async function connectToFakePlatform({
    issuer = 'https://platform-a.example.com',
    clientId = `client-${nanoid(6)}`,
    keyless,
  }: FakeConnection = {}) {
    const side = await orgWithAdmin();
    const id = generateId();
    const [connection] = await db
      .insert(connectionsTable)
      .values({
        id,
        privateJwk: keyless ? null : await mintConnectionKey(id),
        tenantId: side.org.tenantId,
        kind: 'lti',
        issuer,
        clientId,
        name: new URL(issuer).host,
        status: 'active',
        config: {
          authorizationEndpoint: `${issuer}/authorize`,
          tokenEndpoint: `${issuer}/token`,
          jwksUri: `${issuer}/jwks`,
          productFamilyCode: 'test',
          version: '1',
          deploymentIds: ['deployment-1'],
        },
      })
      .returning();
    return { ...side, issuer, clientId, connection, context: await addCourse(side, connection, `${issuer}/api/lti/courses/course-1/memberships`) };
  }

  /** A context of the side's organization whose launch through `connection` named `membershipsUrl`. */
  const addCourse = (
    side: Awaited<ReturnType<typeof orgWithAdmin>>,
    connection: { id: string; issuer: string | null },
    membershipsUrl: string,
    contextId = 'course-1',
  ) =>
    upsertLtiContext(
      { var: { db } },
      {
        values: {
          tenantId: side.org.tenantId,
          organizationId: side.org.id,
          issuer: connection.issuer ?? '',
          connectionId: connection.id,
          contextId,
          types: [],
          channelType: 'organization',
          channelId: side.org.id,
          membershipsUrl,
        },
        by: side.admin.id,
      },
    );

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
    let api: Server;
    let apiOrigin: string;

    beforeAll(async () => {
      oauth = await startTestOauthServer();
      api = createServer(getRequestListener(baseApp.fetch)).listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => api.once('listening', resolve));
      apiOrigin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      api.close();
      await oauth.close();
    });

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
      // Each side reads the other's key set at a listener of its own in a test: the platform's at the worker, the LTI tool's at the API.
      await db
        .update(connectionsTable)
        .set({ config: { ...connection.config, jwksUri: `${oauth.issuer}/jwks` } })
        .where(eq(connectionsTable.id, connection.id));
      await db
        .update(oauthClientsTable)
        .set({ jwksUri: `${apiOrigin}${new URL(ltiKeySetUrl(connection.id)).pathname}` })
        .where(eq(oauthClientsTable.id, connection.clientId));

      const [installationId] = connection.config.deploymentIds;
      await call(approveLtiInstallation, {
        path: { ...platformSide.path, ltiInstallationId: installationId },
        body: { releasedFields: ['name'], grantedScopes, channelTypes: ['organization'] },
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

    /** A launch of the tab by the person `cookie` signs in, played through both sides as the browser plays it. */
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
      expect(context.membershipsUrl).toContain(`/organizations/${platformSide.org.id}/lti-members/organization/${platformSide.org.id}`);
      expect(send).toHaveBeenCalledWith(
        ltiMemberImportQueue.name,
        { contextId: context.id },
        { singletonKey: context.id, group: { id: connection.id } },
      );

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
        expect(await orgMembershipOf(userId, toolSide.org.id)).toMatchObject({ role: ltiRoleIn('organization', { ltiRoles, connection }) });
      }

      const learnerAccount = imported.identities.find(({ subject }) => subject === learners[0].id)?.userId;
      expect(await launch(connected, learners[0].sessionCookie)).toBe(learnerAccount);

      const before = await toolSideState(connected);
      await importLtiMembersOp(context.id, platformOptions);
      expect(await toolSideState(connected)).toEqual(before);
    });

    // Normal state: an admin who granted nothing names no members in a launch, and one who withdraws the grant later
    // leaves the import without a token, which forgets the address; either way the LTI tool's tenant stays as it was.
    it('stores no membership address without a grant, records a grant withdrawn since, and makes no account', async () => {
      const ungranted = await connectThroughRegistration({ grantedScopes: [] });
      await launch(ungranted, ungranted.platformSide.admin.sessionCookie);
      const [stored] = await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, ungranted.connection.id));
      expect(stored).toMatchObject({ membershipsUrl: null });

      const connected = await connectThroughRegistration();
      const { platformSide } = connected;
      await launch(connected, platformSide.admin.sessionCookie);
      const [installationId] = connected.connection.config.deploymentIds;
      const path = { ...platformSide.path, ltiInstallationId: installationId };
      await call(updateLtiInstallation, { path, body: { grantedScopes: [] }, headers: platformSide.headers });
      const [context] = await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, connected.connection.id));
      const before = await toolSideState(connected);

      await importLtiMembersOp(context.id, platformOptions);
      expect(await contextRow(context.id)).toMatchObject({ importReadCount: 0, importIssue: 'scope_not_granted', membershipsUrl: null });
      expect(await toolSideState(connected)).toEqual(before);
    });
  });

  // Attack: an LTI administrator administers their LMS, not this organization, and is not present to be asked.
  it('gives a person the platform lists as Administrator no organization role that may update the organization, whatever the mapping answers', async () => {
    const top = hierarchy.getMostPrivilegedRole('organization');
    vi.mocked(ltiContextRole).mockImplementation(({ ltiRoles }) => (ltiRoles.includes(lisContextRoles.administrator) ? top : memberRole));
    try {
      const side = await connectToFakePlatform();
      const api = fakePlatformApi(() => ({ members: [{ user_id: 'lms-admin', roles: [lisContextRoles.administrator], name: 'Grace Hopper' }] }));
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
    await db
      .insert(identitiesTable)
      .values({ userId: side.admin.id, kind: 'lti', tenantId: side.org.tenantId, provider: side.issuer, subject: 'lms-teacher', email: null });
    const api = fakePlatformApi(() => ({
      members: [
        { user_id: 'lms-teacher', roles: [lisContextRoles.learner] },
        { user_id: 'lms-student', roles: [lisContextRoles.learner] },
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

  // Attack: a platform that never ends its list holds no import, and no worker, for long. A person it lists without a
  // role the app takes does not hide that the list went on.
  it('stops reading at the bound of a platform that lists without end', async () => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi((url) => ({
      members: Array.from({ length: Number(url.searchParams.get('limit')) }, (_, index) => ({
        user_id: `lms-${index % 4}`,
        roles: index % 4 ? [lisContextRoles.learner] : [],
      })),
      next: url.href,
    }));

    await importLtiMembersOp(side.context.id, api.options);
    expect(api.memberReads()).toHaveLength(maxMembersPages);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 4, importIssue: 'too_many_members' });
  });

  // Attack: a platform that names any number of courses makes the app start at most `maxCoursesPerHour` imports in an
  // hour's window: the take of the last course decides. A course past it says its import waits, unless the last
  // import was refused in a way that lasts.
  it('starts no import of a connection whose courses in the window reached their bound, and records that it waits', async () => {
    const side = await connectToFakePlatform();
    expect(await takeFromImportBudget('courses', side.connection.id, maxCoursesPerHour - 1)).toBe(true);
    const api = fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] }));
    const other = await addCourse(side, side.connection, `${side.issuer}/api/lti/courses/course-2/memberships`, 'course-2');
    await importLtiMembersOp(side.context.id, api.options);
    await importLtiMembersOp(other.id, api.options);
    expect(api.memberReads()).toHaveLength(1);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 1, importIssue: null });
    expect(await contextRow(other.id)).toMatchObject({ importRanAt: null, importIssue: 'waiting' });

    send.mockClear();
    const third = await addCourse(side, side.connection, `${side.issuer}/api/lti/courses/course-3/memberships`, 'course-3');
    await requestLtiMemberImport(third, side.admin.id);
    expect(send).not.toHaveBeenCalled();
    expect(await contextRow(third.id)).toMatchObject({ importRanAt: null, importIssue: 'waiting' });

    // A refusal that lasts stays in place: the connection or the platform has to change before an import reads.
    for (const importIssue of ['register_again', 'scope_not_granted', 'members_refused'] as const) {
      const refused = await addCourse(side, side.connection, `${side.issuer}/api/lti/courses/${importIssue}/memberships`, importIssue);
      await db.update(ltiContextsTable).set({ importIssue }).where(eq(ltiContextsTable.id, refused.id));
      await requestLtiMemberImport(await contextRow(refused.id), side.admin.id);
      expect(await contextRow(refused.id)).toMatchObject({ importIssue });
    }
    expect(send).not.toHaveBeenCalled();

    // A retry of a course counted when it first ran still reads.
    await importLtiMembersOp(side.context.id, { ...api.options, retry: true });
    expect(api.memberReads()).toHaveLength(2);
  });

  // Attack: the people of an hour's window count as their pages are read, and nothing gives them back. A page is read
  // only while the window has room and always counts: with one point left one page is read, not one per course.
  // Reading a course again with an empty list frees nobody, and a first attempt that fails after a page, then its
  // retries, each count what they read. A read the bound stopped keeps its people, records that it waits, and leaves
  // the last import's time and count, also when someone it read has no role the app takes.
  it("counts every page read against the connection's people in the window, retries included, and gives nothing back", async () => {
    const two = [
      { user_id: 'lms-first', roles: [lisContextRoles.learner] },
      { user_id: 'lms-second', roles: [lisContextRoles.learner] },
    ];
    const reread = await connectToFakePlatform();
    expect(await takeFromImportBudget('people', reread.connection.id, maxPeoplePerHour - 3)).toBe(true);
    await importLtiMembersOp(reread.context.id, fakePlatformApi(() => ({ members: two })).options);
    expect(await contextRow(reread.context.id)).toMatchObject({ importReadCount: 2, importIssue: null });
    await importLtiMembersOp(reread.context.id, fakePlatformApi(() => ({ members: [] })).options);
    const courses = [
      await addCourse(reread, reread.connection, `${reread.issuer}/api/lti/courses/course-2/memberships`, 'course-2'),
      await addCourse(reread, reread.connection, `${reread.issuer}/api/lti/courses/course-3/memberships`, 'course-3'),
    ];
    const lastPoint = fakePlatformApi(() => ({ members: two }));
    for (const course of courses) await importLtiMembersOp(course.id, lastPoint.options);
    expect(lastPoint.memberReads()).toHaveLength(1);
    expect(await contextRow(courses[0].id)).toMatchObject({ importReadCount: 2, importIssue: null });
    expect(await contextRow(courses[1].id)).toMatchObject({ importRanAt: null, importIssue: 'waiting' });

    const failing = await connectToFakePlatform();
    expect(await takeFromImportBudget('people', failing.connection.id, maxPeoplePerHour - 5)).toBe(true);
    const firstPage = [...two, { user_id: 'lms-roleless', roles: [] }];
    const api = fakePlatformApi((url) =>
      url.searchParams.has('page') ? new Response(null, { status: 500 }) : { members: firstPage, next: `${url.origin}${url.pathname}?page=2` },
    );
    await expect(importLtiMembersOp(failing.context.id, { ...api.options, lastAttempt: false })).rejects.toThrow();
    const failedAt = (await contextRow(failing.context.id))?.importRanAt;
    expect(failedAt).toBeTruthy();
    await importLtiMembersOp(failing.context.id, { ...api.options, retry: true });
    await importLtiMembersOp(failing.context.id, { ...api.options, retry: true });
    expect(api.memberReads()).toHaveLength(3);
    expect(await contextRow(failing.context.id)).toMatchObject({ importRanAt: failedAt, importReadCount: 0, importIssue: 'waiting' });
    expect(await db.select().from(identitiesTable).where(eq(identitiesTable.tenantId, failing.org.tenantId))).toHaveLength(2);
  });

  // Contract: NRPS 2.0 as the spec's example answers it (section 2.1, its trailing comma dropped) and as Canvas does,
  // whose `Link` header names its other pages beside the next. A member NRPS lists as `Inactive` left the course.
  it("imports the active members of the spec's example and a Canvas page, asking with the NRPS scope and no resource", async () => {
    const side = await connectToFakePlatform();
    const membershipsUrl = side.context.membershipsUrl ?? '';
    const pageUrl = (page: number) => `${membershipsUrl}?page=${page}&per_page=50`;
    const canvasPage = {
      id: membershipsUrl,
      context: { id: '4dde05e8ca1973bcca9bffc13e1548820eee93a3', label: 'CS-101', title: 'Computer Science 101' },
      members: [
        {
          status: 'Active',
          name: 'Sienna Howell',
          picture: 'https://example.instructure.com/images/messages/avatar-50.png',
          given_name: 'Sienna',
          family_name: 'Howell',
          email: 'showell@school.edu',
          lis_person_sourcedid: '1238.8763.00',
          user_id: '535fa085f22b4655f48cd5a36a9215f64c062838',
          roles: [
            'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
            'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
          ],
        },
      ],
    };
    const specExample = {
      id: 'https://lms.example.com/sections/2923/memberships',
      context: { id: '2923-abc', label: 'CPS 435', title: 'CPS 435 Learning Analytics' },
      members: [
        {
          status: 'Active',
          name: 'Jane Q. Public',
          picture: 'https://platform.example.edu/jane.jpg',
          given_name: 'Jane',
          family_name: 'Doe',
          middle_name: 'Marie',
          email: 'jane@platform.example.edu',
          user_id: '0ae836b9-7fc9-4060-006f-27b2066ac545',
          lis_person_sourcedid: '59254-6782-12ab',
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
        },
        { status: 'Inactive', user_id: 'lms-left', roles: [lisContextRoles.learner] },
        // Sakai, and NRPS's own figure, name a context role by its short name.
        { status: 'Active', user_id: 'sakai-learner', name: 'Kai Sakai', roles: ['Learner'] },
      ],
    };
    const links = [`<${pageUrl(1)}>; rel="current"`, `<${pageUrl(2)}>; rel="next"`, `<${pageUrl(1)}>; rel="first"`, `<${pageUrl(2)}>; rel="last"`];
    const headers = { 'Content-Type': ltiNrps.mediaType };
    const api = fakePlatformApi((url) =>
      url.searchParams.get('page') === '2'
        ? Response.json(specExample, { headers })
        : Response.json(canvasPage, { headers: { ...headers, Link: links.join(',') } }),
    );

    await importLtiMembersOp(side.context.id, api.options);
    const [tokenRequest] = api.requests.flatMap(({ params }) => params ?? []);
    expect([tokenRequest.get('scope'), tokenRequest.has('resource')]).toEqual([ltiNrps.scope, false]);
    expect(api.memberReads().map(({ url, accept }) => [url.href, accept])).toEqual([
      [`${membershipsUrl}?limit=50`, ltiNrps.mediaType],
      [pageUrl(2), ltiNrps.mediaType],
    ]);
    const names = await db
      .select({ subject: identitiesTable.subject, name: usersTable.name })
      .from(identitiesTable)
      .innerJoin(usersTable, eq(usersTable.id, identitiesTable.userId))
      .where(eq(identitiesTable.provider, side.issuer))
      .orderBy(identitiesTable.subject);
    expect(names).toEqual([
      { subject: '0ae836b9-7fc9-4060-006f-27b2066ac545', name: 'Jane Q. Public' },
      { subject: '535fa085f22b4655f48cd5a36a9215f64c062838', name: 'Sienna Howell' },
      { subject: 'sakai-learner', name: 'Kai Sakai' },
    ]);
    expect(vi.mocked(ltiContextRole).mock.calls.map(([{ ltiRoles }]) => ltiRoles)).toContainEqual([lisContextRoles.learner]);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 3, importIssue: null });
  });

  // Contract: Instructure's hosted Canvas, as its code answers. Its registration names the deployment beside the client
  // id; its bare-host `authorization_server` is the assertion's audience as given; members are on the school's domain,
  // and its member list's `Link` header names its other pages beside the next.
  it('reads a course of a hosted Canvas by its own answers: its deployment, a bare-host audience and its pagination', async () => {
    const side = await orgWithAdmin();
    const canvas = canvasPlatform('school.instructure.com', '10000000000001');
    const connection = await registerAt(side, canvas);
    expect(connection).toMatchObject({
      issuer: 'https://canvas.instructure.com',
      config: { deploymentIds: ['1:abc123def456'], registrationClientUri: canvas.registration.registration_client_uri },
    });
    const context = await addCourse(side, connection, canvas.membershipsUrl('1'));
    const second = `${canvas.membershipsUrl('1')}?page=2&per_page=50`;
    const api = fakePlatformApi((url) =>
      url.searchParams.get('page') === '2'
        ? canvasMemberPage(url, [canvasMember('9f8e7d6c5b4a39281706f5e4d3c2b1a098765432', 'Lena Ortiz')])
        : canvasMemberPage(url, [canvasMember('535fa085f22b4655f48cd5a36a9215f64c062838', 'Sienna Howell')], second),
    );

    await importLtiMembersOp(context.id, api.options);
    const [token] = api.requests.filter(({ params }) => params);
    expect(token.url.href).toBe('https://sso.canvaslms.com/login/oauth2/token');
    expect(decodeJwt(token.params?.get('client_assertion') ?? '')).toMatchObject({ iss: '10000000000001', aud: 'sso.canvaslms.com' });
    expect(api.memberReads().map(({ url }) => url.href)).toEqual([`${canvas.membershipsUrl('1')}?limit=50`, second]);
    expect(await contextRow(context.id)).toMatchObject({ importReadCount: 2, importIssue: null });
  });

  // Contract: a Moodle site as its code answers. Without `authorization_server` the assertion names the token endpoint;
  // the next page comes in a `Link` header; and roles hold institution and system roles beside the context role, which
  // reach the app's mapping as they come.
  it('reads a course of a Moodle site by its own answers', async () => {
    const side = await orgWithAdmin();
    const moodle = moodlePlatform('moodle.school.edu', 'moodle-client');
    const connection = await registerAt(side, moodle);
    const context = await addCourse(side, connection, moodle.membershipsUrl('2'));
    const teacherRoles = [
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
      lisContextRoles.instructor,
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator',
    ];
    const api = fakePlatformApi((url) =>
      url.searchParams.get('from') === '50'
        ? moodleMemberPage(url, [moodleMember('3', 'Sam Student', [lisContextRoles.learner])])
        : moodleMemberPage(url, [moodleMember('2', 'Admin User', teacherRoles)], 50),
    );
    vi.mocked(ltiContextRole).mockClear();

    await importLtiMembersOp(context.id, api.options);
    const [token] = api.requests.filter(({ params }) => params);
    expect(decodeJwt(token.params?.get('client_assertion') ?? '')).toMatchObject({ iss: 'moodle-client', aud: moodle.configuration.token_endpoint });
    expect(api.memberReads().map(({ url }) => url.href)).toEqual([
      `${moodle.membershipsUrl('2')}?limit=50`,
      `${moodle.membershipsUrl('2')}?limit=50&from=50`,
    ]);
    expect(vi.mocked(ltiContextRole).mock.calls.map(([{ ltiRoles }]) => ltiRoles)).toContainEqual(teacherRoles);
    expect(await contextRow(context.id)).toMatchObject({ importReadCount: 2, importIssue: null });
  });

  // NRPS takes a `Link` header as RFC 8288 writes it: a next page named relative to the page resolves against it.
  it('follows a relative next link, resolved against the page', async () => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi((url) =>
      url.searchParams.get('page') === '2'
        ? { members: [{ user_id: 'lms-second', roles: [lisContextRoles.learner] }] }
        : { members: [{ user_id: 'lms-first', roles: [lisContextRoles.learner] }], next: '?page=2' },
    );

    await importLtiMembersOp(side.context.id, api.options);
    expect(api.memberReads().map(({ url }) => url.href)).toEqual([
      `${side.context.membershipsUrl}?limit=50`,
      `${side.context.membershipsUrl}?page=2`,
    ]);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 2, importIssue: null });
  });

  // OAuth: a token the platform no longer takes answers 401; the import asks for one new token and reads the page again.
  it('asks for a new token once when a member read answers 401, and reads on with it', async () => {
    const side = await connectToFakePlatform();
    let refused = false;
    const api = fakePlatformApi(() => {
      if (refused) return { members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] };
      refused = true;
      return new Response(null, { status: 401 });
    });

    await importLtiMembersOp(side.context.id, api.options);
    const tokenRequests = api.requests.filter(({ params }) => params);
    expect(tokenRequests).toHaveLength(2);
    expect(api.memberReads().map(({ authorization }) => authorization)).toEqual([`Bearer ${side.clientId}:1`, `Bearer ${side.clientId}:2`]);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 1, importIssue: null });
  });

  // Contract: Sakai answers a token without the roster scope with a 400. A client error is the platform's refusal and is
  // not tried again: the address goes until a launch names it again. A throttle is tried again and keeps it.
  it.each([
    { status: 400, issue: 'members_refused', kept: false },
    { status: 429, issue: 'retrying', kept: true },
  ])('records a member list answered with $status as $issue', async ({ status, issue, kept }) => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi(() => Response.json({ error: 'Scope roster not in access token' }, { status }));

    await importLtiMembersOp(side.context.id, { ...api.options, lastAttempt: false }).catch(() => undefined);
    expect(api.memberReads()).toHaveLength(1);
    const membershipsUrl = kept ? side.context.membershipsUrl : null;
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 0, importIssue: issue, membershipsUrl });
  });

  // Attack: the installation's token goes wherever a next link points. Only a page at the launch's membership address
  // on the platform's own origin is read; any other next link refuses the import, which then writes no one.
  it.each([
    { to: 'another origin', next: 'https://elsewhere.example.com/api/lti/courses/course-1/memberships?page=2' },
    { to: 'another path', next: 'https://platform-a.example.com/api/lti/courses/course-2/memberships?page=2' },
  ])('refuses a next link to $to, and writes no one', async ({ next }) => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }], next }));

    await importLtiMembersOp(side.context.id, api.options);
    expect(api.memberReads()).toHaveLength(1);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 0, importIssue: 'address_refused' });
    expect(await ltiIdentities(side.issuer)).toEqual([]);
  });

  // One seat rule for invitations, launches and imports: whoever needs a seat when none is left stays out, and the
  // rest go on. A name the platform lists in parts names an account as a launch's parts do. Attack: a name the
  // platform lists never replaces the name of an account someone signs in to.
  it('leaves out who needs a seat at the member limit, goes on with the rest, and names only a placeholder account', async () => {
    const side = await connectToFakePlatform();
    await db
      .insert(identitiesTable)
      .values({ userId: side.admin.id, kind: 'lti', tenantId: side.org.tenantId, provider: side.issuer, subject: 'lms-teacher', email: null });
    await importLtiMembersOp(
      side.context.id,
      fakePlatformApi(() => ({ members: [{ user_id: 'lms-early', roles: [lisContextRoles.learner] }] })).options,
    );
    const [early] = await ltiIdentities(side.issuer).then((rows) => rows.filter(({ subject }) => subject === 'lms-early'));
    const named = async (userId: string) => (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)))[0].name;
    const adminName = await named(side.admin.id);

    await limitSeats(side, 0);
    const api = fakePlatformApi(() => ({
      members: [
        { user_id: 'lms-new', roles: [lisContextRoles.learner], name: 'Ada Lovelace' },
        { user_id: 'lms-early', roles: [lisContextRoles.learner], given_name: 'Grace', family_name: 'Hopper' },
        { user_id: 'lms-teacher', roles: [lisContextRoles.instructor], name: 'Someone Else' },
      ],
    }));
    await importLtiMembersOp(side.context.id, api.options);

    expect((await ltiIdentities(side.issuer)).map(({ subject }) => subject).sort()).toEqual(['lms-early', 'lms-teacher']);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 3, importIssue: 'member_limit' });
    expect(await named(early.userId)).toBe('Grace Hopper');
    expect(await named(side.admin.id)).toBe(adminName);
  });

  // Attack: a person the app's role mapping gives no role is no member: the import leaves them out with no account,
  // and the course says people were left out. An institution Administrator alone is read as the context's.
  it('leaves out who has no role the app takes, makes no account for them, and records it', async () => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi(() => ({
      members: [
        { user_id: 'lms-learner', roles: [lisContextRoles.learner] },
        { user_id: 'lms-staff', roles: [lisInstitutionRoles.staff] },
        { user_id: 'lms-admin', roles: [lisInstitutionRoles.administrator] },
      ],
    }));
    await importLtiMembersOp(side.context.id, api.options);
    expect((await ltiIdentities(side.issuer)).map(({ subject }) => subject).sort()).toEqual(['lms-admin', 'lms-learner']);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 3, importIssue: 'no_role' });
  });

  // Attack: two tenants registered at one platform read one membership address, never with each other's token.
  it('sends each connection only its own token, though both read one membership address', async () => {
    const issuer = 'https://platform-a.example.com';
    const first = await connectToFakePlatform({ issuer, clientId: 'client-first' });
    const second = await connectToFakePlatform({ issuer, clientId: 'client-second' });
    const api = fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] }));

    await importLtiMembersOp(first.context.id, api.options);
    const firstReads = api.memberReads().length;
    await importLtiMembersOp(second.context.id, api.options);

    const reads = api.memberReads();
    expect(reads.slice(0, firstReads).every(({ authorization }) => authorization?.startsWith('Bearer client-first:'))).toBe(true);
    expect(reads.slice(firstReads).length).toBeGreaterThan(0);
    expect(reads.slice(firstReads).every(({ authorization }) => authorization?.startsWith('Bearer client-second:'))).toBe(true);
  });

  /** Registers the app for the side's tenant at a platform answered in-process by `platform`, its configuration and its answer. */
  async function registerAt(side: Awaited<ReturnType<typeof orgWithAdmin>>, platform: PlatformFixture) {
    const link = await call(createLtiRegistrationLink, { path: side.path, headers: side.headers });
    const answer: GuardedTransport = async ({ method, url }) => {
      if (method === 'GET' && url.href === platform.configurationUrl) return Response.json(platform.configuration);
      if (method === 'POST' && url.href === platform.configuration.registration_endpoint)
        return Response.json(platform.registration, { status: 201 });
      return new Response(null, { status: 404 });
    };
    const connection = await registerLtiPlatformOp(
      { link: new URL((link.data as { url: string }).url).searchParams.get('link') ?? '', openid_configuration: platform.configurationUrl },
      { transport: answer, resolve: loopback },
    );
    if (!isLtiConnection(connection)) throw new Error('the registration stored no LTI connection');
    return connection;
  }

  /** The key set the API serves at a connection's `jwks_uri`. */
  const keySetOf = (connectionId: string) => fetchApp(new URL(ltiKeySetUrl(connectionId)).pathname);
  const publicKeyOf = async (connectionId: string) => ((await (await keySetOf(connectionId)).json()) as { keys: JWK[] }).keys;

  // Attack: a platform verifies the app's assertions against the key set its registration names. With one key for every
  // connection, a platform an admin registered could replay an assertion the app signed for it at another platform.
  it("gives each connection a key of its own, and serves at each key set address that connection's public key alone", async () => {
    const side = await orgWithAdmin();
    const first = await registerAt(side, moodlePlatform('moodle-a.example.com', 'client-a'));
    const second = await registerAt(side, moodlePlatform('moodle-b.example.com', 'client-b'));

    const [firstKeys, secondKeys] = await Promise.all([publicKeyOf(first.id), publicKeyOf(second.id)]);
    expect([firstKeys.length, secondKeys.length]).toEqual([1, 1]);
    expect(firstKeys[0]).not.toMatchObject({ kid: secondKeys[0].kid });
    expect(firstKeys[0]).not.toMatchObject({ n: secondKeys[0].n });
    expect(Object.keys(firstKeys[0]).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
  });

  // Attack: a platform names another registration's client id, token endpoint and audience, to make the app sign an
  // assertion that registration's platform accepts. The app signs it with the key of the connection that asked, which
  // the other registration's key set does not hold.
  it("signs for a platform that names another registration's client id and token endpoint with its own connection's key", async () => {
    const victim = await registerAt(await orgWithAdmin(), moodlePlatform('victim.example.com', 'victim-client'));
    const side = await orgWithAdmin();
    const own = moodlePlatform('attacker.example.com', victim.clientId);
    const configuration = { ...own.configuration, token_endpoint: victim.config.tokenEndpoint, authorization_server: victim.issuer };
    const attacker = await registerAt(side, { ...own, configuration });
    const context = await addCourse(side, attacker, own.membershipsUrl('2'));
    const api = fakePlatformApi(() => ({ members: [] }));

    await importLtiMembersOp(context.id, api.options);
    const [tokenRequest] = api.requests.filter(({ params }) => params);
    expect(tokenRequest.url.href).toBe(victim.config.tokenEndpoint);
    const assertion = tokenRequest.params?.get('client_assertion') ?? '';
    expect(decodeJwt(assertion)).toMatchObject({ iss: victim.clientId, sub: victim.clientId, aud: victim.issuer });
    const [attackerKey] = await publicKeyOf(attacker.id);
    const [victimKey] = await publicKeyOf(victim.id);
    await expect(jwtVerify(assertion, await importJWK(attackerKey, 'RS256'))).resolves.toBeDefined();
    await expect(jwtVerify(assertion, await importJWK(victimKey, 'RS256'))).rejects.toThrow();
  });

  // A key set address names its connection: once the connection is deleted, no platform reads a key there.
  it('answers no key set for a connection that was deleted, or never existed', async () => {
    const side = await orgWithAdmin();
    const connection = await registerAt(side, moodlePlatform('moodle-a.example.com', 'client-a'));
    expect((await keySetOf(connection.id)).status).toBe(200);

    const deleted = await call(deleteLtiConnection, { path: { ...side.path, connectionId: connection.id }, headers: side.headers });
    expect(deleted.response.status).toBe(204);
    expect((await keySetOf(connection.id)).status).toBe(404);
    expect((await keySetOf(generateId())).status).toBe(404);
  });

  // A key copied onto another connection's row fails to decrypt there: that connection holds no key, and says so.
  it("answers no key set and signs nothing for a connection that holds another connection's key", async () => {
    const side = await connectToFakePlatform();
    const other = await connectToFakePlatform({ issuer: 'https://platform-b.example.com' });
    const [{ privateJwk }] = await db
      .select({ privateJwk: connectionsTable.privateJwk })
      .from(connectionsTable)
      .where(eq(connectionsTable.id, other.connection.id));
    await db.update(connectionsTable).set({ privateJwk }).where(eq(connectionsTable.id, side.connection.id));
    expect((await keySetOf(side.connection.id)).status).toBe(404);

    const api = fakePlatformApi(() => ({ members: [] }));
    await importLtiMembersOp(side.context.id, api.options);
    expect(api.requests).toEqual([]);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 0, importIssue: 'register_again' });
  });

  // A connection registered before keys were made per connection still launches; reading members takes a new registration.
  it('signs and sends nothing for a connection without a key of its own, and records that it must register again', async () => {
    const side = await connectToFakePlatform({ keyless: true });
    const api = fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] }));

    await importLtiMembersOp(side.context.id, api.options);
    expect(api.requests).toEqual([]);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 0, importIssue: 'register_again' });
    expect(await ltiIdentities(side.issuer)).toEqual([]);
  });

  // Attack: the account an import wrote as stays when its connection goes, and never falls to the tenant's admins, who
  // could turn it on again and give it a key.
  it("keeps the service account of a deleted connection disabled and out of the admins' reach", async () => {
    const side = await connectToFakePlatform();
    await importLtiMembersOp(
      side.context.id,
      fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] })).options,
    );
    const deleted = await call(deleteLtiConnection, { path: { ...side.path, connectionId: side.connection.id }, headers: side.headers });
    expect(deleted.response.status).toBe(204);

    const [account] = await db.select().from(serviceAccountsTable).where(eq(serviceAccountsTable.connectionId, side.connection.id));
    expect(account.status).toBe('disabled');
    const listed = await call(listServiceAccounts, { path: side.path, headers: side.headers });
    expect((listed.data as { results: { id: string }[] }).results.map(({ id }) => id)).not.toContain(account.id);
    const path = { ...side.path, serviceAccountId: account.id };
    await expectRefusal(await call(updateServiceAccount, { path, body: { status: 'active' }, headers: side.headers }), 404, 'not_found');
    await expectRefusal(await call(createApiKey, { path, body: { name: 'key', scopes: null }, headers: side.headers }), 404, 'not_found');
  });

  // A connection deleted while its import reads the platform takes the import with it: no one is written after the
  // delete, not as the disabled account and not against a connection that is gone, and the job ends without a retry.
  it('writes no one once its connection is deleted during the read, and ends without an error', async () => {
    const side = await connectToFakePlatform();
    const elsewhere = await orgWithAdmin();
    await db
      .insert(identitiesTable)
      .values({ userId: elsewhere.admin.id, kind: 'lti', tenantId: side.org.tenantId, provider: side.issuer, subject: 'lms-returning', email: null });
    const api = fakePlatformApi(async () => {
      const deleted = await call(deleteLtiConnection, { path: { ...side.path, connectionId: side.connection.id }, headers: side.headers });
      expect(deleted.response.status).toBe(204);
      return {
        members: [
          { user_id: 'lms-returning', roles: [lisContextRoles.learner] },
          { user_id: 'lms-new', roles: [lisContextRoles.learner] },
        ],
      };
    });

    await expect(importLtiMembersOp(side.context.id, api.options)).resolves.toBeUndefined();
    expect(await orgMembershipOf(elsewhere.admin.id, side.org.id)).toBeUndefined();
    expect((await ltiIdentities(side.issuer)).map(({ subject }) => subject)).toEqual(['lms-returning']);
  });

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  /** Runs `work` in a transaction that stays open until `release`, and the backend that holds its locks. */
  async function openTransaction(work: (tx: Tx) => Promise<unknown>) {
    let end = () => {};
    const ended = new Promise<void>((resolve) => {
      end = resolve;
    });
    let holding: (pid: number) => void = () => {};
    const held = new Promise<number>((resolve) => {
      holding = resolve;
    });
    const done = db.transaction(async (tx) => {
      await work(tx);
      const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      holding(rows[0].pid);
      await ended;
    });
    onTestFinished(async () => {
      end();
      await done.catch(() => undefined);
    });
    const pid = await Promise.race([held, done.then(() => 0)]);
    const release = async () => {
      end();
      await done;
    };
    return { pid, release };
  }

  /** Waits until the backend `pid` blocks one other, such as a delete of the connection it holds. */
  const blockingOne = (pid: number) =>
    vi.waitFor(async () => {
      const { rows } = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`,
      );
      expect(rows[0].waiting).toBe(1);
    });

  // A delete while an import makes the connection's account would find no account to disable and leave it active,
  // unless it waits for the import's lock on the connection.
  it('disables the account an import makes while its connection is deleted', async () => {
    const side = await connectToFakePlatform();
    const { connection } = side;
    if (!isLtiConnection(connection)) throw new Error('no LTI connection');
    const importing = await openTransaction((tx) => connectionServiceAccountId({ var: { db: tx } }, connection));

    const deleting = call(deleteLtiConnection, { path: { ...side.path, connectionId: connection.id }, headers: side.headers });
    await blockingOne(importing.pid);
    await importing.release();

    expect((await deleting).response.status).toBe(204);
    const [account] = await db.select().from(serviceAccountsTable).where(eq(serviceAccountsTable.connectionId, connection.id));
    expect(account.status).toBe('disabled');
  });

  // Attack: deleting a connection cuts off everyone who came through it. A session made while the delete waits for an
  // import's write is either refused or revoked with the rest, never left live without its connection.
  it('leaves no live session of a connection deleted while an import writes a person', async () => {
    const side = await connectToFakePlatform();
    const importing = await openTransaction((tx) => holdConnection({ var: { db: tx } }, { id: side.connection.id }));
    const deleting = call(deleteLtiConnection, { path: { ...side.path, connectionId: side.connection.id }, headers: side.headers });
    await blockingOne(importing.pid);

    const session = {
      secretHash: nanoid(),
      userId: side.admin.id,
      deviceType: 'desktop' as const,
      authStrategy: 'lti' as const,
      connectionId: side.connection.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    let settled = false;
    const inserting = db
      .insert(sessionsTable)
      .values(session)
      .returning({ id: sessionsTable.id })
      .catch(() => [])
      .finally(() => {
        settled = true;
      });
    // The insert goes through beside the waiting delete, or waits behind it.
    await vi.waitFor(async () => {
      if (settled) return;
      const { rows } = await db.execute<{ blocked: number }>(
        sql`select count(*)::int as blocked from pg_stat_activity where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0`,
      );
      expect(rows[0].blocked).toBe(2);
    });
    await importing.release();

    expect((await deleting).response.status).toBe(204);
    for (const { id } of await inserting) {
      const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
      expect(row.revokedAt).not.toBeNull();
    }
  });

  // Attack: a course list tells which platforms an organization trusts and how its imports ran; it is for whoever may update the organization.
  it("lists the courses of the organization's own connections, and refuses a member and another tenant's admin", async () => {
    const own = await connectToFakePlatform();
    const other = await connectToFakePlatform({ issuer: 'https://platform-b.example.com' });
    await importLtiMembersOp(
      own.context.id,
      fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] })).options,
    );

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
