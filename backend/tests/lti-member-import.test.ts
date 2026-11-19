import { and, eq, inArray, sql } from 'drizzle-orm';
import { decodeJwt } from 'jose';
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
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { lisContextRoles, ltiNrps } from '#/lib/lti-vocabulary';
import { getPgBoss } from '#/lib/pg-boss';
import { sessionsTable } from '#/modules/auth/core/sessions/sessions-db';
import { maxMembersPages } from '#/modules/auth/flows/lti/helpers/platform-memberships';
import { ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import { ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';
import { upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { connectionServiceAccountId } from '#/modules/auth/flows/lti/operations/connection-service-account';
import { importLtiMembersOp, ltiMemberImportQueue } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { connectionsTable, isLtiConnection } from '#/modules/connections/connections-db';
import { holdConnection } from '#/modules/connections/connections-queries';
import { ltiPlatformConfiguration } from '#/modules/lti-platform/helpers/platform-offer';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { countTakenSeats } from '#/modules/memberships/operations/organization-seats';
import { currentSigningKey, ensureSigningKeys } from '#/modules/oauth-server/keystore';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
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
  const transport: GuardedTransport = async ({ url, headers, body }) => {
    const params = url.pathname === '/token' ? new URLSearchParams(body) : undefined;
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

  /** A tenant connected to a platform at `issuer`, with a context of its organization whose launch named its membership address. */
  async function connectToFakePlatform(issuer = 'https://platform-a.example.com', clientId = `client-${nanoid(6)}`) {
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
          tokenEndpoint: `${issuer}/token`,
          jwksUri: `${issuer}/jwks`,
          productFamilyCode: 'test',
          version: '1',
          deploymentIds: ['deployment-1'],
        },
      })
      .returning();
    return { ...side, issuer, clientId, connection, context: await addCourse(side, connection.id, `${issuer}/api/lti/courses/course-1/memberships`) };
  }

  /** A context of the side's organization whose launch named `membershipsUrl`. */
  const addCourse = (side: Awaited<ReturnType<typeof orgWithAdmin>>, connectionId: string, membershipsUrl: string) =>
    upsertLtiContext(
      { var: { db } },
      {
        values: {
          tenantId: side.org.tenantId,
          organizationId: side.org.id,
          connectionId,
          contextId: 'course-1',
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
      expect(context.membershipsUrl).toContain(`/organizations/${platformSide.org.id}/lti-members/organization/${platformSide.org.id}`);
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

    // Normal state: an admin who granted nothing names no members in a launch, and one who withdraws the grant later
    // leaves the import without a token; either way the LTI tool's tenant stays as it was.
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
    await db.insert(identitiesTable).values({ userId: side.admin.id, kind: 'lti', provider: side.issuer, subject: 'lms-teacher', email: null });
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

  // Attack: a platform that never ends its list holds no import, and no worker, for long.
  it('stops reading at the bound of a platform that lists without end', async () => {
    const side = await connectToFakePlatform();
    const api = fakePlatformApi((url) => ({
      members: Array.from({ length: Number(url.searchParams.get('limit')) }, (_, index) => ({
        user_id: `lms-${index % 3}`,
        roles: [lisContextRoles.learner],
      })),
      next: url.href,
    }));

    await importLtiMembersOp(side.context.id, api.options);
    expect(api.memberReads()).toHaveLength(maxMembersPages);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 3, importIssue: 'too_many_members' });
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
    ]);
    expect(await contextRow(side.context.id)).toMatchObject({ importReadCount: 2, importIssue: null });
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
    await db.insert(identitiesTable).values({ userId: side.admin.id, kind: 'lti', provider: side.issuer, subject: 'lms-teacher', email: null });
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

  // Attack: two tenants registered at one platform read one membership address, never with each other's token.
  it('sends each connection only its own token, though both read one membership address', async () => {
    const issuer = 'https://platform-a.example.com';
    const first = await connectToFakePlatform(issuer, 'client-first');
    const second = await connectToFakePlatform(issuer, 'client-second');
    const api = fakePlatformApi(() => ({ members: [{ user_id: 'lms-student', roles: [lisContextRoles.learner] }] }));

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
  // organization. Such a platform registers, as Brightspace and Schoology do, and its import signs and sends nothing.
  describe('a platform that names another host than its issuer for its token', () => {
    const attacker = 'https://attacker.example.com';
    const victim = 'https://victim.example.com';
    const variants = [
      {
        name: 'its own token endpoint and the victim as the audience',
        tokenEndpoint: `${attacker}/token`,
        authorizationServer: victim,
        membershipsUrl: `${attacker}/api/lti/courses/attacker/memberships`,
      },
      {
        name: "the victim's token endpoint and a course there",
        tokenEndpoint: `${victim}/token`,
        authorizationServer: undefined,
        membershipsUrl: `${victim}/api/lti/courses/victim/memberships`,
      },
    ];

    it.each(variants)('registers a platform that names $name, and signs and sends nothing to import', async (variant) => {
      const side = await orgWithAdmin();
      const link = await call(createLtiRegistrationLink, { path: side.path, headers: side.headers });
      const requests: URL[] = [];
      const transport: GuardedTransport = async ({ url }) => {
        requests.push(url);
        if (url.pathname === '/register') return Response.json({ client_id: 'victim-client' }, { status: 201 });
        const configuration = ltiPlatformConfiguration({ jwksUri: `${attacker}/jwks`, tokenEndpoint: variant.tokenEndpoint });
        return Response.json({
          ...configuration,
          issuer: attacker,
          authorization_endpoint: `${attacker}/authorize`,
          registration_endpoint: `${attacker}/register`,
          authorization_server: variant.authorizationServer,
        });
      };

      const connection = await registerLtiPlatformOp(
        { link: new URL((link.data as { url: string }).url).searchParams.get('link') ?? '', openid_configuration: `${attacker}/lti/configuration` },
        { transport, resolve: loopback },
      );
      expect(connection.config).toMatchObject({ tokenEndpoint: variant.tokenEndpoint });
      const context = await addCourse(side, connection.id, variant.membershipsUrl);
      requests.length = 0;
      vi.mocked(currentSigningKey).mockClear();

      await importLtiMembersOp(context.id, { transport, resolve: loopback });
      expect(requests).toEqual([]);
      expect(currentSigningKey).not.toHaveBeenCalled();
      expect(await contextRow(context.id)).toMatchObject({ importReadCount: 0, importIssue: 'address_refused' });
      expect(await ltiIdentities(attacker)).toEqual([]);
    });
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
      .values({ userId: elsewhere.admin.id, kind: 'lti', provider: side.issuer, subject: 'lms-returning', email: null });
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
    const other = await connectToFakePlatform('https://platform-b.example.com');
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
