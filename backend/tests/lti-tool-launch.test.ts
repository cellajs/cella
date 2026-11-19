import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { and, eq, sql } from 'drizzle-orm';
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createLtiRegistrationLink,
  createLtiResourceLink,
  deleteLtiConnection,
  getMe,
  inviteMembers,
  startLtiLaunch,
  startLtiToolRegistration,
} from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { embeddedSessionHeader, embeddedSessionParam } from 'shared/utils/embedded-session';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { AppError, type ErrorKey } from '#/core/error';
import { baseDb as db } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { lisContextRoles, ltiClaims, ltiTestUserRole } from '#/lib/lti-vocabulary';
import { getPgBoss } from '#/lib/pg-boss';
import { ltiLaunchUrl } from '#/modules/auth/flows/lti/helpers/registration-request';
import { ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';
import { upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { planLtiContextChannel } from '#/modules/auth/flows/lti/operations/finish-lti-launch';
import { importLtiMembersOp, ltiMemberImportQueue } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { connectionsTable, isLtiConnection } from '#/modules/connections/connections-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { countTakenSeats } from '#/modules/memberships/operations/organization-seats';
import { organizationsTable } from '#/modules/organization/organization-db';
import { lockTenantQuota } from '#/modules/tenants/quota-lock';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { identitiesTable } from '#/modules/user/identities-db';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
import { createTestOrganization } from './helpers';
import { decodeHtml, parseForm, startTestOauthServer, type TestOauthServer } from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser, orgMembershipOf } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are.
vi.mock('#/modules/auth/flows/lti/lti-context-channel', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLtiContextChannel(await importOriginal()),
);
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

// The app takes both LTI roles: the round trip launches it in itself.
setTestConfig({ enabledAuthStrategies: ['passkey', 'lti'] });
overrideConfig(appConfig.has, { ltiPlatform: true });

const embeddedHeader = { [embeddedSessionHeader]: '1' };

/** The platform storage exchange a login or launch page carries in its body. */
const pageExchange = (page: string) => {
  const exchange: { subject: string; key: string; value?: string; next?: string; origin: string } = JSON.parse(
    decodeHtml(/data-exchange="([^"]*)"/.exec(page)?.[1] ?? '{}'),
  );
  return exchange;
};

/** The embedded session cookie a response sets, and the `name=value` pair a browser sends back. */
const embeddedCookieOf = (response: Response) => {
  const cookie = response.headers.getSetCookie().find((set) => set.includes('-embedded-session-'));
  return { cookie, pair: cookie?.split(';')[0] ?? '' };
};

describe('LTI launch at the app as an LTI tool', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const keyServers: Server[] = [];

  afterEach(async () => await clearSecurityTestData());
  afterAll(() => {
    for (const server of keyServers) server.close();
  });

  const fetchApp = (path: string, init?: RequestInit) => baseApp.fetch(new Request(`http://localhost${path}`, init));

  /** A platform of its own: an RS256 key pair whose public half a key set on a loopback address serves. */
  async function fakePlatform(name: string) {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: `${name}-key`, alg: 'RS256', use: 'sig' };
    const server = createServer((_request, response) => response.end(JSON.stringify({ keys: [jwk] }))).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    keyServers.push(server);
    return { name, privateKey, kid: jwk.kid, jwksUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks` };
  }

  type Platform = Awaited<ReturnType<typeof fakePlatform>>;
  type TestOrganization = Awaited<ReturnType<typeof createTestOrganization>>;

  /**
   * A tenant's active connection to `platform`, as a registration stores it. Its token endpoint sits on another host,
   * as Brightspace's and Schoology's do: a launch never reads it.
   */
  async function connect(
    platform: Platform,
    deploymentIds = ['deployment-1'],
    { org: existing, clientId = `${platform.name}-client` }: { org?: TestOrganization; clientId?: string } = {},
  ) {
    const org = existing ?? (await createTestOrganization());
    const issuer = `https://${platform.name}.example.com`;
    const [connection] = await db
      .insert(connectionsTable)
      .values({
        tenantId: org.tenantId,
        kind: 'lti',
        issuer,
        clientId,
        name: platform.name,
        status: 'active',
        config: {
          authorizationEndpoint: `${issuer}/authorize`,
          tokenEndpoint: `https://auth.${platform.name}.example.net/token`,
          jwksUri: platform.jwksUri,
          productFamilyCode: 'test',
          version: '1',
          deploymentIds,
        },
      })
      .returning();
    return { org, connection, platform, issuer, clientId };
  }

  type Connected = Awaited<ReturnType<typeof connect>>;

  /** Starts a login as the platform's frame does, and reads what its page stores and where it goes next. */
  async function login(connected: Connected) {
    const query = new URLSearchParams({ iss: connected.issuer, client_id: connected.clientId, login_hint: 'hint', lti_storage_target: '_parent' });
    const page = await fetchApp(`/auth/lti/login?${query}`);
    const exchange = pageExchange(await page.text());
    const next = new URL(exchange.next ?? '');
    return { page, exchange, nonce: next.searchParams.get('nonce') ?? '', state: next.searchParams.get('state') ?? '', value: exchange.value ?? '' };
  }

  /** The claims of a valid resource link launch for the login's nonce. */
  const launchClaims = (connected: Connected, nonce: string, sub = `user-${nanoid(6)}`): JWTPayload => ({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    iss: connected.issuer,
    aud: connected.clientId,
    sub,
    nonce,
    name: 'Ada Lovelace',
    [ltiClaims.messageType]: 'LtiResourceLinkRequest',
    [ltiClaims.version]: '1.3.0',
    [ltiClaims.deploymentId]: 'deployment-1',
    [ltiClaims.targetLinkUri]: ltiLaunchUrl(),
    [ltiClaims.resourceLink]: { id: 'resource-1' },
    [ltiClaims.roles]: [lisContextRoles.learner],
    [ltiClaims.context]: { id: 'course-1', label: 'C1', title: 'Course one' },
  });

  const sign = (claims: JWTPayload, platform: Pick<Platform, 'privateKey' | 'kid'>) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: platform.kid }).sign(platform.privateKey);

  /** The launch page's same-origin post to the finish route, with the value platform storage held. */
  const finish = (fields: { id_token: string; state: string; storage_value: string }, headers: Record<string, string> = {}) =>
    fetchApp('/auth/lti/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: appConfig.frontendUrl, 'Sec-Fetch-Site': 'same-origin', ...headers },
      body: new URLSearchParams(fields),
    });

  /** A launch through login and finish; `changes` replace claims of the valid launch, an undefined one drops it. */
  async function launch(
    connected: Connected,
    changes: Partial<Record<string, unknown>> = {},
    signer: Pick<Platform, 'privateKey' | 'kid'> = connected.platform,
  ) {
    const started = await login(connected);
    const claims = Object.fromEntries(
      Object.entries({ ...launchClaims(connected, started.nonce), ...changes }).filter(([, value]) => value !== undefined),
    );
    const idToken = await sign(claims, signer);
    return { started, idToken, response: await finish({ id_token: idToken, state: started.state, storage_value: started.value }) };
  }

  /** A refusal page naming the error's translated text, with no session set. */
  const expectRefusalPage = async (response: Response, status: number, type: ErrorKey) => {
    expect(response.status).toBe(status);
    expect(decodeHtml(await response.text())).toContain(new AppError(400, type, 'info').message);
    expect(embeddedCookieOf(response).cookie).toBeUndefined();
  };

  // An attacker holds a platform registration of their own, a launch of someone else, or a frame beside the app's.
  it('refuses forged, replayed, misdirected and incomplete launches, and creates no account for them', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const other = await connect(await fakePlatform('platform-b'));
    const nowSeconds = Math.floor(Date.now() / 1000);

    const rows: { name: string; run: () => Promise<Response>; status: number; type: ErrorKey }[] = [
      {
        name: 'signed by another key',
        run: async () => (await launch(connected, {}, other.platform)).response,
        status: 401,
        type: 'lti_launch_invalid',
      },
      {
        name: 'a token of one connection under another',
        run: async () => {
          const started = await login(other);
          const idToken = await sign(launchClaims(other, started.nonce), connected.platform);
          return finish({ id_token: idToken, state: started.state, storage_value: started.value });
        },
        status: 401,
        type: 'lti_launch_invalid',
      },
      {
        name: 'a nonce of another connection',
        run: async () => {
          const started = await login(other);
          const idToken = await sign(launchClaims(connected, started.nonce), connected.platform);
          return finish({ id_token: idToken, state: started.state, storage_value: started.value });
        },
        status: 401,
        type: 'lti_launch_invalid',
      },
      {
        name: 'a wrong audience',
        run: async () => (await launch(connected, { aud: 'stranger', azp: connected.clientId })).response,
        status: 401,
        type: 'lti_launch_invalid',
      },
      {
        name: 'an audience of no connection',
        run: async () => (await launch(connected, { aud: 'stranger' })).response,
        status: 401,
        type: 'lti_platform_unknown',
      },
      {
        name: 'several audiences without azp',
        run: async () => (await launch(connected, { aud: [connected.clientId, 'stranger'] })).response,
        status: 401,
        type: 'lti_launch_invalid',
      },
      { name: 'expired', run: async () => (await launch(connected, { exp: nowSeconds - 60 })).response, status: 401, type: 'lti_launch_invalid' },
      {
        name: 'a wrong message type',
        run: async () => (await launch(connected, { [ltiClaims.messageType]: 'LtiDeepLinkingRequest' })).response,
        status: 401,
        type: 'lti_launch_invalid',
      },
      {
        name: 'a wrong version',
        run: async () => (await launch(connected, { [ltiClaims.version]: '1.1' })).response,
        status: 401,
        type: 'lti_launch_invalid',
      },
      { name: 'no sub', run: async () => (await launch(connected, { sub: undefined })).response, status: 403, type: 'lti_launch_anonymous' },
      {
        name: 'no roles claim',
        run: async () => (await launch(connected, { [ltiClaims.roles]: undefined })).response,
        status: 403,
        type: 'lti_launch_no_roles',
      },
      {
        name: 'a deployment the connection does not hold',
        run: async () => (await launch(connected, { [ltiClaims.deploymentId]: 'deployment-2' })).response,
        status: 403,
        type: 'lti_deployment_unknown',
      },
      {
        name: 'the test user role',
        run: async () => (await launch(connected, { [ltiClaims.roles]: [lisContextRoles.learner, ltiTestUserRole] })).response,
        status: 403,
        type: 'lti_launch_test_user',
      },
      {
        name: 'a wrong stored value',
        run: async () => {
          const started = await login(connected);
          return finish({
            id_token: await sign(launchClaims(connected, started.nonce), connected.platform),
            state: started.state,
            storage_value: 'guessed',
          });
        },
        status: 401,
        type: 'lti-nonce_not_found',
      },
      {
        name: 'no stored value',
        run: async () => {
          const started = await login(connected);
          return finish({
            id_token: await sign(launchClaims(connected, started.nonce), connected.platform),
            state: started.state,
            storage_value: '',
          });
        },
        status: 401,
        type: 'lti_launch_invalid',
      },
      {
        name: 'a finish the browser marks cross-site',
        run: async () => {
          const started = await login(connected);
          const idToken = await sign(launchClaims(connected, started.nonce), connected.platform);
          return finish({ id_token: idToken, state: started.state, storage_value: started.value }, { 'Sec-Fetch-Site': 'cross-site' });
        },
        status: 403,
        type: 'lti_launch_cross_site',
      },
    ];
    for (const row of rows)
      await expectRefusalPage(await row.run(), row.status, row.type).catch((err) => Promise.reject(new Error(`${row.name}: ${err}`)));
    expect(await db.select().from(identitiesTable).where(eq(identitiesTable.kind, 'lti'))).toHaveLength(0);

    // A launch is spent once: the same token and value again find no nonce.
    const valid = await launch(connected);
    expect(valid.response.status).toBe(303);
    const replay = await finish({ id_token: valid.idToken, state: valid.started.state, storage_value: valid.started.value });
    await expectRefusalPage(replay, 401, 'lti-nonce_not_found');

    // A platform that offers no platform storage is refused at the login.
    const noStorage = await fetchApp(
      `/auth/lti/login?${new URLSearchParams({ iss: connected.issuer, client_id: connected.clientId, login_hint: 'hint' })}`,
    );
    await expectRefusalPage(noStorage, 400, 'lti_storage_missing');

    // An empty roles list is a launch without a role: the person arrives with the least privileged role.
    expect((await launch(connected, { [ltiClaims.roles]: [] })).response.status).toBe(303);
  });

  // Two first launches at once: one records its deployment, the other is refused whether it read the connection before that record or after.
  it('records the deployment of the first launch to a connection that holds none, and refuses a concurrent first launch from another', async () => {
    const connected = await connect(await fakePlatform('platform-a'), []);
    const deploymentIds = ['deployment-1', 'deployment-2'];
    const posts = await Promise.all(
      deploymentIds.map(async (deploymentId) => {
        const started = await login(connected);
        const idToken = await sign({ ...launchClaims(connected, started.nonce), [ltiClaims.deploymentId]: deploymentId }, connected.platform);
        return { id_token: idToken, state: started.state, storage_value: started.value };
      }),
    );
    const responses = await Promise.all(posts.map((post) => finish(post)));

    const winner = responses.findIndex((response) => response.status === 303);
    expect(winner).not.toBe(-1);
    await expectRefusalPage(responses[1 - winner], 403, 'lti_deployment_unknown');
    const [row] = await db.select().from(connectionsTable).where(eq(connectionsTable.id, connected.connection.id));
    expect(isLtiConnection(row) && row.config.deploymentIds).toEqual([deploymentIds[winner]]);
    expect(await db.select().from(identitiesTable).where(eq(identitiesTable.kind, 'lti'))).toHaveLength(1);
  });

  // The embedded cookie is partitioned per parent site; a sibling frame there holds it too.
  it('reads the embedded session only for a marked request, never the normal one for it, refuses its cross-site writes and what a guest may not do, and ends it with its connection', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const launched = await launch(connected);
    const embedded = embeddedCookieOf(launched.response).pair;
    const member = await createFactorOrgUser(call, connected.org.tenantId, connected.org.id, `lti-${nanoid(8)}`, adminRole);
    const both = `${embedded}; ${member.sessionCookie}`;

    const me = async (cookie: string, headers: Record<string, string> = {}) =>
      (await (await fetchApp('/me', { headers: { Cookie: cookie, ...headers } })).json()).user;
    const embeddedUser = await me(both, embeddedHeader);
    expect(embeddedUser.id).not.toBe(member.id);
    expect((await me(both)).id).toBe(member.id);
    expect((await fetchApp('/me', { headers: { Cookie: embedded } })).status).toBe(401);
    expect((await fetchApp('/me', { headers: { Cookie: member.sessionCookie, ...embeddedHeader } })).status).toBe(401);

    // A frame beside the app's can send a body-less form post with the query marker; the browser marks it cross-site.
    const crossSite = await fetchApp(`/me?${embeddedSessionParam}=1`, {
      method: 'DELETE',
      headers: { Cookie: embedded, 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);
    expect((await crossSite.json()).type).toBe('embedded_session_cross_site');

    // An account a launch made has no proven address: the gate refuses it what it refuses a guest, such as a tenant of its own.
    const tenant = await fetchApp('/tenants', {
      method: 'POST',
      headers: { Cookie: embedded, ...embeddedHeader, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(tenant.status).toBe(403);
    expect((await tenant.json()).type).toBe('anonymous_session_restricted');
    expect((await me(embedded, embeddedHeader)).id).toBe(embeddedUser.id);

    // Deleting the connection ends the sessions its launches started.
    const deleted = await call(deleteLtiConnection, {
      path: { tenantId: connected.org.tenantId, organizationId: connected.org.id, connectionId: connected.connection.id },
      headers: { ...defaultHeaders, Cookie: member.sessionCookie },
    });
    expect(deleted.response.status).toBe(204);
    expect((await fetchApp('/me', { headers: { Cookie: embedded, ...embeddedHeader } })).status).toBe(401);
  });

  it('signs out of the session a request asks for and leaves the other', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const embedded = embeddedCookieOf((await launch(connected)).response).pair;
    const member = await createFactorOrgUser(call, connected.org.tenantId, connected.org.id, `lti-${nanoid(8)}`, adminRole);
    const both = `${embedded}; ${member.sessionCookie}`;
    const meStatus = async (headers: Record<string, string> = {}) => (await fetchApp('/me', { headers: { Cookie: both, ...headers } })).status;
    const signOut = (headers: Record<string, string> = {}) =>
      fetchApp('/auth/sign-out', {
        method: 'POST',
        headers: { Cookie: both, Origin: appConfig.frontendUrl, 'Sec-Fetch-Site': 'same-origin', ...headers },
      });

    expect((await signOut()).status).toBe(204);
    expect(await meStatus()).toBe(401);
    expect(await meStatus(embeddedHeader)).toBe(200);

    expect((await signOut(embeddedHeader)).status).toBe(204);
    expect(await meStatus(embeddedHeader)).toBe(401);
  });

  // The platform names where its course's members are, and the connection's token goes there: an address the guarded
  // fetch takes, on any host, as Canvas names one apart from its issuer. A learner's launch without the claim keeps what
  // an earlier one kept; a teacher's clears it, so a grant withdrawn on the platform queues no more imports.
  it("keeps the membership address a launch names, asks for a member import after a teacher's launch, and clears it after one without", async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const membershipsUrl = 'https://school.example.net/api/lti/courses/c1/names_and_roles';
    const teacher = (claim?: Record<string, unknown>) => ({ [ltiClaims.roles]: [lisContextRoles.instructor], [ltiClaims.namesRoleService]: claim });
    const kept = async () => {
      const [row] = await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, connected.connection.id));
      return { id: row.id, membershipsUrl: row.membershipsUrl };
    };
    const send = vi.mocked((await getPgBoss('producer')).send);
    const requests: URL[] = [];
    const recording: GuardedTransport = async ({ url }) => {
      requests.push(url);
      return new Response(null, { status: 500 });
    };

    const untrusted = [
      { context_memberships_url: 'ftp://school.example.net/memberships', service_versions: ['2.0'] },
      { context_memberships_url: `${membershipsUrl}#elsewhere`, service_versions: ['2.0'] },
      { context_memberships_url: membershipsUrl, service_versions: ['1.0'] },
    ];
    for (const claim of untrusted) {
      expect((await launch(connected, teacher(claim))).response.status).toBe(303);
      expect(await kept()).toMatchObject({ membershipsUrl: null });
    }
    await importLtiMembersOp((await kept()).id, { transport: recording, resolve: async () => [{ address: '127.0.0.1', family: 4 }] });
    expect(requests).toEqual([]);
    expect(send).not.toHaveBeenCalled();

    await launch(connected, teacher({ context_memberships_url: membershipsUrl, service_versions: ['2.0'] }));
    const { id: contextId, ...stored } = await kept();
    expect(stored).toEqual({ membershipsUrl });
    expect(send).toHaveBeenCalledWith(ltiMemberImportQueue.name, { contextId }, { singletonKey: contextId, group: { id: connected.connection.id } });

    send.mockClear();
    await launch(connected);
    expect(await kept()).toMatchObject({ membershipsUrl });
    await launch(connected, teacher());
    expect(await kept()).toMatchObject({ membershipsUrl: null });
    expect(send).not.toHaveBeenCalled();

    // NRPS's prose names one version where its example lists them: a single string reads as a list of one.
    await launch(connected, teacher({ context_memberships_url: membershipsUrl, service_versions: '2.0' }));
    expect(await kept()).toMatchObject({ membershipsUrl });
  });

  /** Sets the tenant's member limit to the seats its organization holds, and `free` more. */
  async function limitMembers({ org }: Connected, free = 0) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, org.tenantId));
    const user = (await countTakenSeats({ var: { db } }, { organizationId: org.id })) + free;
    await db
      .update(tenantsTable)
      .set({ restrictions: { ...tenant.restrictions, quotas: { ...tenant.restrictions.quotas, user } } })
      .where(eq(tenantsTable.id, tenant.id));
  }

  // Attack: a person the member limit keeps out of an invitation does not walk in by launching; a member always does.
  it('refuses a launch that needs a seat when the member limit leaves none, and lets a member in', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const member = await createFactorOrgUser(call, connected.org.tenantId, connected.org.id, `lti-${nanoid(8)}`, adminRole);
    await db
      .insert(identitiesTable)
      .values({ userId: member.id, kind: 'lti', tenantId: connected.org.tenantId, provider: connected.issuer, subject: 'lms-member', email: null });
    await limitMembers(connected);

    await expectRefusalPage((await launch(connected)).response, 403, 'lti_member_limit');
    expect(await db.select().from(identitiesTable).where(eq(identitiesTable.provider, connected.issuer))).toHaveLength(1);
    expect((await launch(connected, { sub: 'lms-member' })).response.status).toBe(303);
  });

  // Attack: an archive refuses joining a channel, and a launch is no way around it; a member is never locked out.
  it('refuses a launch that would add a person to an archived course, and lets a member in with the role they hold', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const member = await createFactorOrgUser(call, connected.org.tenantId, connected.org.id, `lti-${nanoid(8)}`, adminRole);
    await db
      .insert(identitiesTable)
      .values({ userId: member.id, kind: 'lti', tenantId: connected.org.tenantId, provider: connected.issuer, subject: 'lms-member', email: null });
    // The template's course is the organization, which only a direct write archives.
    await db.update(organizationsTable).set({ archived: true }).where(eq(organizationsTable.id, connected.org.id));

    await expectRefusalPage((await launch(connected)).response, 403, 'channel_archived');
    expect(await db.select().from(identitiesTable).where(eq(identitiesTable.provider, connected.issuer))).toHaveLength(1);
    expect((await launch(connected, { sub: 'lms-member' })).response.status).toBe(303);
    expect(await orgMembershipOf(member.id, connected.org.id)).toMatchObject({ role: adminRole });
  });

  // Attack: an invitation and a launch that both count the last seat free pass the limit together, unless one lock orders them.
  it('lets in one of an invitation and a launch racing for the last seat', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const { org } = connected;
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, adminRole);
    await limitMembers(connected, 1);

    // The quota lock is held until both wait for it: neither counts before the other could.
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding: (pid: number) => void = () => {};
    const locked = new Promise<number>((resolve) => {
      holding = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await lockTenantQuota({ var: { db: tx } }, { tenantId: org.tenantId, key: 'user' });
      const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      holding(rows[0].pid);
      await released;
    });
    onTestFinished(async () => {
      release();
      await holder.catch(() => undefined);
    });
    const pid = await locked;

    const invited = call(inviteMembers, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      query: { channelId: org.id, channelType: 'organization' },
      body: { emails: [`racer-${nanoid(6)}@example.com`], role: memberRole },
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    const launched = launch(connected);
    await vi.waitFor(async () => {
      const { rows } = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`,
      );
      expect(rows[0].waiting).toBe(2);
    });
    release();
    await holder;

    const [invitation, launching] = await Promise.all([invited, launched]);
    expect([invitation.response.status === 200, launching.response.status === 303].filter(Boolean)).toHaveLength(1);
  });

  // Attack: any tenant's admin can register "a platform" under an issuer whose host serves a file of theirs, with keys of
  // their own. A launch through that connection reaches the accounts made through its own tenant alone.
  it("makes a new account for a person another tenant's connection to the same issuer knows, with no membership there", async () => {
    const victim = await connect(await fakePlatform('platform-a'));
    expect((await launch(victim, { sub: 'lms-person' })).response.status).toBe(303);
    const attacker = await connect(await fakePlatform('platform-a'), ['deployment-1'], { clientId: 'attacker-client' });
    expect(attacker.issuer).toBe(victim.issuer);

    expect((await launch(attacker, { sub: 'lms-person' })).response.status).toBe(303);
    const identities = await db.select().from(identitiesTable).where(eq(identitiesTable.provider, victim.issuer));
    const byTenant = new Map(identities.map(({ tenantId, userId }) => [tenantId, userId]));
    expect(byTenant.size).toBe(2);
    const attackerAccount = byTenant.get(attacker.org.tenantId) ?? '';
    expect(attackerAccount).not.toBe(byTenant.get(victim.org.tenantId));
    expect(await orgMembershipOf(attackerAccount, victim.org.id)).toBeUndefined();
  });

  // Registering a platform again in a tenant gives a new connection: it takes over the courses of the one it replaces,
  // with their channels and their people.
  it('lets a new registration of the same platform take over a course, its channel and its people', async () => {
    const platform = await fakePlatform('platform-a');
    const first = await connect(platform);
    const admin = await createFactorOrgUser(call, first.org.tenantId, first.org.id, `lti-${nanoid(8)}`, adminRole);
    const teacher = { sub: 'lms-teacher', [ltiClaims.roles]: [lisContextRoles.instructor] };
    await launch(first, teacher);
    await launch(first, { sub: 'lms-student' });
    const courses = () => db.select().from(ltiContextsTable).where(eq(ltiContextsTable.tenantId, first.org.tenantId));
    const [course] = await courses();
    const accounts = async () =>
      (await db.select().from(identitiesTable).where(eq(identitiesTable.tenantId, first.org.tenantId))).map(({ userId }) => userId).sort();
    const people = await accounts();

    const path = { tenantId: first.org.tenantId, organizationId: first.org.id, connectionId: first.connection.id };
    const deleted = await call(deleteLtiConnection, { path, headers: { ...defaultHeaders, Cookie: admin.sessionCookie } });
    expect(deleted.response.status).toBe(204);
    expect(await courses()).toEqual([expect.objectContaining({ id: course.id, connectionId: null })]);

    const second = await connect(platform, ['deployment-1'], { org: first.org, clientId: 'platform-a-client-again' });
    expect((await launch(second, teacher)).response.status).toBe(303);
    expect(await courses()).toEqual([expect.objectContaining({ id: course.id, connectionId: second.connection.id, channelId: course.channelId })]);
    expect(await accounts()).toEqual(people);
    for (const userId of people) expect(await orgMembershipOf(userId, first.org.id)).toBeDefined();
  });

  // D6: an address across institutions is no proof of the account behind it.
  it('creates a separate account for an email claim an account of another tenant holds', async () => {
    const connected = await connect(await fakePlatform('platform-a'));
    const elsewhere = await createTestOrganization();
    const holder = await createFactorOrgUser(call, elsewhere.tenantId, elsewhere.id, `lti-${nanoid(8)}`, adminRole);
    const launched = await launch(connected, { email: holder.email });
    expect(launched.response.status).toBe(303);
    const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.kind, 'lti'));
    expect(identity.userId).not.toBe(holder.id);
    expect(await orgMembershipOf(holder.id, connected.org.id)).toBeUndefined();
  });

  // The template's hierarchy has no channel below the organization: the plan is checked as an app with one meets it.
  it('lets an Instructor or Administrator set up a context below the organization, and tells anyone else it is not set up', async () => {
    const { org, connection: ltiConnection } = await connect(await fakePlatform('platform-a'));
    const ctx = { var: { db } };
    const context = { id: 'course-1', title: 'Course one', types: [] };
    const plan = (ltiRoles: string[]) =>
      planLtiContextChannel(ctx, { connection: { ...ltiConnection, issuer: ltiConnection.issuer ?? '' }, context, ltiRoles });

    await expect(plan([lisContextRoles.learner])).rejects.toMatchObject({ status: 409, type: 'lti_context_not_set_up' });
    expect(await plan([lisContextRoles.instructor])).toEqual({ create: context });
    expect(await plan([lisContextRoles.administrator])).toEqual({ create: context });

    // Once a launch recorded the channel it created, everyone of the context lands there.
    const instructor = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, adminRole);
    await upsertLtiContext(ctx, {
      values: {
        tenantId: org.tenantId,
        organizationId: org.id,
        issuer: ltiConnection.issuer ?? '',
        connectionId: ltiConnection.id,
        contextId: context.id,
        types: [],
        channelType: 'organization',
        channelId: org.id,
      },
      by: instructor.id,
    });
    expect(await plan([lisContextRoles.learner])).toMatchObject({ channel: { id: org.id } });

    // A new registration of the platform in the tenant finds the course's channel: an Instructor's launch creates none.
    const again = { id: generateId(), tenantId: org.tenantId, issuer: ltiConnection.issuer ?? '' };
    const replanned = await planLtiContextChannel(ctx, { connection: again, context, ltiRoles: [lisContextRoles.instructor] });
    expect(replanned).toMatchObject({ channel: { id: org.id } });
  });

  // One app is the platform in one tenant and the LTI tool in another, and launches itself, as the development seed does.
  it('launches itself: a placement in one tenant opens the other tenant as an embedded session of a new account', async () => {
    const oauth: TestOauthServer = await startTestOauthServer();
    try {
      const orgWithAdmin = async () => {
        const org = await createTestOrganization();
        const admin = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, adminRole);
        return { org, admin, path: { tenantId: org.tenantId, organizationId: org.id }, headers: { ...defaultHeaders, Cookie: admin.sessionCookie } };
      };
      const toolSide = await orgWithAdmin();
      const platformSide = await orgWithAdmin();

      // The registration of lti-platform.test.ts: the worker answers in-process at the addresses the configuration names.
      const link = await call(createLtiRegistrationLink, { path: toolSide.path, headers: toolSide.headers });
      const started = await call(startLtiToolRegistration, {
        path: platformSide.path,
        body: { registrationUrl: (link.data as { url: string }).url },
        headers: platformSide.headers,
      });
      const registrationUrl = new URL((started.data as { url: string }).url);
      const transport: GuardedTransport = ({ url, method, headers, body }) =>
        fetch(new URL(`${url.pathname}${url.search}`, oauth.issuer), { method, headers, body, redirect: 'manual' });
      const connection = await registerLtiPlatformOp(
        {
          link: registrationUrl.searchParams.get('link') ?? '',
          openid_configuration: registrationUrl.searchParams.get('openid_configuration') ?? '',
          registration_token: registrationUrl.searchParams.get('registration_token') ?? undefined,
        },
        { transport, resolve: async () => [{ address: '127.0.0.1', family: 4 }] },
      );
      if (!isLtiConnection(connection)) throw new Error('the registration stored no LTI connection');
      // The key set lives on the worker's own listener in a test.
      await db
        .update(connectionsTable)
        .set({ config: { ...connection.config, jwksUri: `${oauth.issuer}/jwks` } })
        .where(eq(connectionsTable.id, connection.id));
      const [installationId] = connection.config.deploymentIds;
      await call(approveLtiInstallation, {
        path: { ...platformSide.path, ltiInstallationId: installationId },
        body: { releasedFields: ['name'] },
        headers: platformSide.headers,
      });
      const placed = await call(createLtiResourceLink, {
        path: platformSide.path,
        body: { channelType: 'organization', channelId: platformSide.org.id, installationId, title: 'Tool side' },
        headers: platformSide.headers,
      });

      // The platform's frame loads its login initiation page, which posts cross-site to the LTI tool's login.
      const launchStart = await call(startLtiLaunch, {
        path: { ...platformSide.path, ltiResourceLinkId: (placed.data as { id: string }).id },
        headers: platformSide.headers,
      });
      const startToken = new URL((launchStart.data as { url: string }).url).searchParams.get('token') ?? '';
      const initiation = parseForm(await (await fetchApp(`/lti-launches/~initiate-login?token=${startToken}`)).text());
      expect(initiation.action).toBe(`${appConfig.backendAuthUrl}/lti/login?lti_storage_target=_parent`);
      const loginPage = await fetchApp('/auth/lti/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://lms.example.com' },
        body: new URLSearchParams(initiation.fields),
      });
      expect(loginPage.status).toBe(200);
      expect(loginPage.headers.get('Content-Security-Policy')).toContain(`frame-ancestors ${new URL(appConfig.oauthUrl).origin}`);

      // The test plays the browser: the platform's storage, then the redirects and posts between the two sides.
      const storage = new Map<string, string>();
      const put = pageExchange(await loginPage.text());
      expect(put).toMatchObject({ subject: 'lti.put_data', origin: new URL(appConfig.oauthUrl).origin });
      storage.set(put.key, put.value ?? '');
      const authorization = new URL(put.next ?? '');
      const answer = parseForm(await (await fetch(`${oauth.issuer}/lti/authorize${authorization.search}`)).text());
      expect(answer.action).toBe(ltiLaunchUrl());

      const launchPage = await fetchApp('/auth/lti/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: new URL(appConfig.oauthUrl).origin },
        body: new URLSearchParams(answer.fields),
      });
      const launchHtml = await launchPage.text();
      const get = pageExchange(launchHtml);
      expect(get).toMatchObject({ subject: 'lti.get_data', key: put.key });
      const posted = parseForm(launchHtml);
      const finished = await finish({ id_token: posted.fields.id_token, state: posted.fields.state, storage_value: storage.get(get.key) ?? '' });

      expect(finished.status).toBe(303);
      expect(finished.headers.get('Location')).toBe(
        `${appConfig.frontendUrl}/embed/n?${new URLSearchParams({ tenantId: toolSide.org.tenantId, organizationId: toolSide.org.id, channelId: toolSide.org.id, channelType: 'organization' })}`,
      );
      const { cookie, pair } = embeddedCookieOf(finished);
      for (const attribute of ['Secure', 'HttpOnly', 'SameSite=None', 'Partitioned']) expect(cookie).toContain(attribute);

      const [identity] = await db
        .select()
        .from(identitiesTable)
        .where(
          and(eq(identitiesTable.kind, 'lti'), eq(identitiesTable.provider, appConfig.oauthUrl), eq(identitiesTable.subject, platformSide.admin.id)),
        );
      expect(identity).toMatchObject({ connectionId: connection.id });
      expect(identity.userId).not.toBe(platformSide.admin.id);
      expect(await orgMembershipOf(identity.userId, toolSide.org.id)).toMatchObject({ role: hierarchy.getLeastPrivilegedRole('organization') });
      expect(await db.select().from(ltiContextsTable).where(eq(ltiContextsTable.connectionId, connection.id))).toMatchObject([
        { contextId: platformSide.org.id, channelType: 'organization', channelId: toolSide.org.id },
      ]);

      const me = await call(getMe, { headers: { Cookie: pair, ...embeddedHeader } });
      expect(me.data).toMatchObject({ user: { id: identity.userId, isAnonymous: true } });
      expect(await db.select().from(membershipsTable).where(eq(membershipsTable.userId, identity.userId))).toHaveLength(1);
    } finally {
      await oauth.close();
    }
  });
});
