import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createLtiResourceLink,
  deleteLtiInstallation,
  deleteLtiResourceLink,
  getOrganization,
  listLtiInstallations,
  listLtiInstallationTabs,
  listLtiMembers,
  listLtiResourceLinks,
  listLtiTabs,
  startLtiLaunch,
  startLtiToolRegistration,
  updateLtiInstallation,
  updateLtiResourceLink,
  updateServiceAccount,
} from 'sdk';
import { type AccessScope, appConfig, policyMatrix } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { lisContextRoles, ltiClaims, ltiNrps, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { ltiMembershipsUrl } from '#/modules/lti-platform/helpers/launch-message';
import { minLtiMembersPage } from '#/modules/lti-platform/lti-platform-schema';
import { ltiResourceLinksTable } from '#/modules/lti-platform/lti-resource-links-db';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { mockUser } from '#/modules/user/user-mocks';
import { insertUsers } from '#/modules/user/user-queries';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
import { createTestOrganization, expectRefusal } from './helpers';
import {
  authorizationCodeToken,
  bearerHeaders,
  clientCredentialsToken,
  installApp,
  parseForm,
  registerApp,
  serviceAccountWithKey,
  startTestOauthServer,
  type TestOauthServer,
} from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser } from './security/helpers';
import { insertStaleSession } from './security/session-helpers';
import { createAppClient } from './test-client';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are.
vi.mock('#/modules/auth/flows/lti/lti-context-channel', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLtiContextChannel(await importOriginal()),
);
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

overrideConfig(appConfig.has, { ltiPlatform: true });

const ltiToolHost = 'peer-review.example.com';
const launchUri = `https://${ltiToolHost}/launch`;

/** A Dynamic Registration request of a fake LTI tool whose keys `jwksUri` serves, on a domain it declares, asking for `scope`. */
const ltiToolRegistration = (jwksUri: string, scope: string) => ({
  application_type: 'web',
  grant_types: ['client_credentials', 'implicit'],
  response_types: ['id_token'],
  token_endpoint_auth_method: 'private_key_jwt',
  client_name: 'Peer review',
  initiate_login_uri: `https://${ltiToolHost}/login`,
  redirect_uris: [launchUri],
  jwks_uri: jwksUri,
  scope,
  [ltiToolConfigurationMember]: {
    domain: ltiToolHost,
    secondary_domains: ['127.0.0.1'],
    target_link_uri: launchUri,
    claims: ['iss', 'sub', 'name', 'email'],
    messages: [{ type: 'LtiResourceLinkRequest' }],
  },
});

const signingKey = async (kid: string) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' } };
};

type SigningKey = Awaited<ReturnType<typeof signingKey>>;

type Member = { user_id: string; roles: string[]; status: string; name?: string; email?: string; picture?: string };
type Container = { id: string; context: { id: string; label: string; title: string }; members: Member[] };

/** The target of a `Link` header's `rel="next"`, as the template's platform writes it. */
const nextOf = (response: Response) => /<([^>]*)>; rel="next"/.exec(response.headers.get('Link') ?? '')?.[1];

/**
 * An installed LTI tool reads the members of a course it is placed in by Names and Role Provisioning Services 2.0,
 * with a token for its registered key, within the scopes an admin granted.
 */
describe('LTI installation API access', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let oauth: TestOauthServer;
  let keyServer: Server;
  let jwksUri: string;
  let ltiToolKey: SigningKey;
  let strangerKey: SigningKey;

  beforeAll(async () => {
    oauth = await startTestOauthServer();
    ltiToolKey = await signingKey('lti-tool-key');
    strangerKey = await signingKey('stranger-key');
    keyServer = createServer((_request, response) => response.end(JSON.stringify({ keys: [ltiToolKey.jwk] }))).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => keyServer.once('listening', resolve));
    jwksUri = `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}/jwks`;
  });

  afterAll(async () => {
    keyServer.close();
    await oauth.close();
  });

  afterEach(async () => await clearSecurityTestData());

  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, adminRole);
    const path = { tenantId: org.tenantId, organizationId: org.id };
    return { org, path, headers: { ...defaultHeaders, Cookie: admin.sessionCookie }, admin };
  }

  type Org = Awaited<ReturnType<typeof orgWithAdmin>>;

  interface InstallOptions {
    scope?: string;
    /** What the approval releases and grants; null leaves the installation pending. */
    approval?: { releasedFields: ('name' | 'email')[]; grantedScopes: AccessScope[] } | null;
    /** The channel types the approval allows it a tab in. */
    allowed?: 'organization'[];
    placed?: boolean;
  }

  /** Sends the fake LTI tool's registration request to the issuer with a token the organization's admin started. */
  async function register(org: Org, request: ReturnType<typeof ltiToolRegistration>) {
    const started = await call(startLtiToolRegistration, {
      path: org.path,
      body: { registrationUrl: `https://${ltiToolHost}/register` },
      headers: org.headers,
    });
    const registrationToken = new URL((started.data as { url: string }).url).searchParams.get('registration_token') ?? '';
    return fetch(`${oauth.issuer}/lti/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registrationToken}` },
      body: JSON.stringify(request),
    });
  }

  /** Registers the fake LTI tool in the organization's tenant, approves it and places it in the organization. */
  async function installLtiTool(
    org: Org,
    {
      scope = ltiNrps.scope,
      approval = { releasedFields: [], grantedScopes: ['user:read'] },
      allowed = ['organization'],
      placed = true,
    }: InstallOptions = {},
  ) {
    const response = await register(org, ltiToolRegistration(jwksUri, scope));
    const registered = (await response.json()) as { client_id: string; [ltiToolConfigurationMember]: { deployment_id: string } };
    const installationId = registered[ltiToolConfigurationMember].deployment_id;
    if (approval)
      await call(approveLtiInstallation, {
        path: { ...org.path, ltiInstallationId: installationId },
        body: { ...approval, channelTypes: allowed },
        headers: org.headers,
      });
    const ltiTool = { org, clientId: registered.client_id, installationId, resourceLinkId: '' };
    if (placed) ltiTool.resourceLinkId = await placeLtiTool(ltiTool);
    return ltiTool;
  }

  type LtiTool = Awaited<ReturnType<typeof installLtiTool>>;

  async function placeLtiTool({ org, installationId }: Pick<LtiTool, 'org' | 'installationId'>) {
    const body = { channelType: 'organization' as const, channelId: org.org.id, installationId, title: 'Peer review' };
    const created = await call(createLtiResourceLink, { path: org.path, body, headers: org.headers });
    return (created.data as { id: string }).id;
  }

  interface TokenRequest {
    scope?: string;
    resource?: string;
    key?: SigningKey;
    audience?: string | string[];
    /** Headers a proxy in front of the worker would pass on, such as a forwarded host. */
    headers?: Record<string, string>;
    /** Seconds from now; a negative value makes an expired assertion. */
    expiresIn?: number;
    assertion?: string;
  }

  /**
   * The LTI tool's `client_credentials` request, authenticated with an assertion signed by `key` (`private_key_jwt`),
   * naming a resource only when given, as LTI tools name none.
   */
  async function requestToken(
    ltiTool: LtiTool,
    { scope = ltiNrps.scope, resource, key = ltiToolKey, audience = appConfig.oauthUrl, expiresIn = 120, assertion, headers }: TokenRequest = {},
  ) {
    const now = Math.floor(Date.now() / 1000);
    const signed =
      assertion ??
      (await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: key.kid })
        .setIssuer(ltiTool.clientId)
        .setSubject(ltiTool.clientId)
        .setAudience(audience)
        .setJti(nanoid())
        .setIssuedAt(Math.min(now, now + expiresIn - 60))
        .setExpirationTime(now + expiresIn)
        .sign(key.privateKey));
    const response = await fetch(`${oauth.issuer}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: signed,
        scope,
        ...(resource && { resource }),
      }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, assertion: signed };
  }

  const tokenOf = async (ltiTool: LtiTool, request?: TokenRequest) => {
    const answer = await requestToken(ltiTool, request);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    return String(answer.body.access_token);
  };

  /** A page of members at an address an NRPS reader holds, the first or a next link, read with the NRPS media type. */
  const readMembersAt = async (address: string, accessToken: string) => {
    const url = new URL(address);
    const response = await baseApp.request(`${url.pathname}${url.search}`, {
      headers: { Accept: ltiNrps.mediaType, Authorization: `Bearer ${accessToken}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain(ltiNrps.mediaType);
    return { container: (await response.json()) as Container, next: nextOf(response) };
  };

  /** Adds `count` members to the organization at once, for a course longer than a page. */
  const addLearners = async (org: Org, count: number) => {
    const users = await insertUsers({ var: { db } }, { users: Array.from({ length: count }, () => mockUser()) });
    const items = users.map(({ id }) => ({ userId: id, role: memberRole, entity: org.org, createdBy: org.admin.id }));
    await insertMemberships({ var: { db } }, { items });
    return users;
  };

  const readMembers = (org: Org, token: string, channelId = org.org.id) =>
    call(listLtiMembers, { path: { ...org.path, channelType: 'organization', channelId }, headers: bearerHeaders(token) });

  /** What the issuer posts back for a launch record, as the frame and the LTI tool run it: an ID token or a refusal. */
  async function authorizeLaunch(launchToken: string) {
    const page = await baseApp.fetch(new Request(`http://localhost/lti-launches/~initiate-login?token=${launchToken}`));
    const { fields } = parseForm(await page.text());
    const query = new URLSearchParams({
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: fields.client_id,
      redirect_uri: launchUri,
      login_hint: fields.login_hint,
      lti_message_hint: fields.lti_message_hint,
      nonce: nanoid(),
    });
    const response = await fetch(`${oauth.issuer}/lti/authorize?${query}`);
    return parseForm(await response.text()).fields;
  }

  /** A launch of the resource link by `cookie`'s person: the claims of its ID token. */
  async function launch(ltiTool: LtiTool, cookie = ltiTool.org.admin.sessionCookie) {
    const started = await call(startLtiLaunch, {
      path: { ...ltiTool.org.path, ltiResourceLinkId: ltiTool.resourceLinkId },
      headers: { ...defaultHeaders, Cookie: cookie },
    });
    const launchToken = new URL((started.data as { url: string }).url).searchParams.get('token') ?? '';
    return decodeJwt((await authorizeLaunch(launchToken)).id_token);
  }

  // Contract: an NRPS reader (ltijs, pylti1.3, the template's own) reads the claim, asks for a token with the NRPS scope
  // and no resource, and pages the membership container by its `Link` header. The shape is the spec's section 2.1.
  it('names the members in the NRPS claim, and a token for the registered key pages them as an NRPS membership container', async () => {
    const org = await orgWithAdmin();
    const member = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
    const ltiTool = await installLtiTool(org);

    const claim = (await launch(ltiTool))[ltiClaims.namesRoleService];
    const membershipsUrl = ltiMembershipsUrl(org.path, { channelType: 'organization', channelId: org.org.id });
    expect(claim).toEqual({ context_memberships_url: membershipsUrl, service_versions: ['2.0'] });

    const answer = await requestToken(ltiTool);
    expect(answer).toMatchObject({ status: 200, body: { token_type: 'Bearer', scope: ltiNrps.scope } });
    const accessToken = String(answer.body.access_token);
    expect(decodeJwt(accessToken)).toMatchObject({
      scope: 'user:read',
      aud: resourceUri({ face: 'api', tenantId: org.org.tenantId }),
      actor_kind: 'service',
      installation_id: ltiTool.installationId,
      client_id: ltiTool.clientId,
    });

    // A `limit` below the smallest page reads that page: a reader of a few hundred stays inside the burst limit.
    const learners = await addLearners(org, minLtiMembersPage + 3);
    const readPage = (address: string) => readMembersAt(address, accessToken);
    const first = await readPage(`${membershipsUrl}?limit=1`);
    expect(first.container).toEqual({
      id: `${membershipsUrl}?limit=1`,
      context: { id: org.org.id, label: org.org.slug, title: org.org.name },
      members: expect.any(Array),
    });
    expect(first.container.members).toHaveLength(minLtiMembersPage);
    const second = await readPage(first.next ?? '');
    expect(second.next).toBeUndefined();
    const members = [...first.container.members, ...second.container.members];
    const expected = [
      { user_id: org.admin.id, roles: [lisContextRoles.instructor], status: 'Active' },
      ...[member, ...learners].map(({ id }) => ({ user_id: id, roles: [lisContextRoles.learner], status: 'Active' })),
    ];
    expect(members).toEqual(expected.sort((a, b) => a.user_id.localeCompare(b.user_id)));

    const instructors = await readPage(`${membershipsUrl}?role=Instructor`);
    expect(instructors).toEqual({
      container: expect.objectContaining({ members: [expected.find(({ user_id }) => user_id === org.admin.id)] }),
      next: undefined,
    });
  });

  // NRPS: a page with a `role` filter may hold fewer than `limit` and still link to the next. One page reads at most ten
  // batches of people: a course where the role is rare answers short pages over all of it.
  it('answers a page a role filter thins below its limit with a next link, until the course is read', async () => {
    const org = await orgWithAdmin();
    const ltiTool = await installLtiTool(org);
    await addLearners(org, 10 * minLtiMembersPage + 5);
    const accessToken = await tokenOf(ltiTool);
    const membershipsUrl = ltiMembershipsUrl(org.path, { channelType: 'organization', channelId: org.org.id });

    const first = await readMembersAt(`${membershipsUrl}?role=Instructor&limit=1`, accessToken);
    expect(first.container.members.map(({ user_id }) => user_id)).toEqual([org.admin.id]);
    expect(first.next).toBeDefined();
    const second = await readMembersAt(first.next ?? '', accessToken);
    expect(second).toEqual({ container: expect.objectContaining({ members: [] }), next: undefined });
  });

  // NRPS section 3: one resource link's members carry a message per member, which the platform does not build. A reader
  // that asks for them learns so, and never takes the course's members for the tab's.
  it("refuses a request for one resource link's members", async () => {
    const org = await orgWithAdmin();
    const ltiTool = await installLtiTool(org);
    const answer = await call(listLtiMembers, {
      path: { ...org.path, channelType: 'organization', channelId: org.org.id },
      query: { rlid: ltiTool.resourceLinkId },
      headers: bearerHeaders(await tokenOf(ltiTool)),
    });
    await expectRefusal(answer, 400, 'lti_rlid_unsupported');
  });

  // Contract: ltijs 7 registers asking for the NRPS scope beside scopes the platform does not serve.
  it('records an NRPS scope asked for at registration as `user:read`, answers it by its NRPS name, and offers it', async () => {
    const org = await orgWithAdmin();
    const asked = `${ltiNrps.scope} https://purl.imsglobal.org/spec/lti-ags/scope/score`;
    const response = await register(org, ltiToolRegistration(jwksUri, asked));
    const registered = (await response.json()) as { client_id: string; scope?: string };
    expect(registered.scope).toBe(ltiNrps.scope);
    const [client] = await db.select().from(oauthClientsTable).where(eq(oauthClientsTable.id, registered.client_id));
    expect(client.requestedScopes).toEqual(['user:read']);

    const configuration = (await (await fetch(`${oauth.issuer}/lti/openid-configuration`)).json()) as { scopes_supported: string[] };
    expect(configuration.scopes_supported).toContain(ltiNrps.scope);
  });

  // Privacy: an LTI tool granted nothing is told nothing about the members.
  it('names no members in the launch of an LTI tool granted no scope', async () => {
    const org = await orgWithAdmin();
    const ltiTool = await installLtiTool(org, { approval: { releasedFields: [], grantedScopes: [] } });
    expect((await launch(ltiTool))[ltiClaims.namesRoleService]).toBeUndefined();
  });

  // Attack: whoever serves the key set mints the installation's tokens. It lies on the domains the admin approves, as launches do.
  it('refuses a registration whose key set lies off the domains it declares', async () => {
    const org = await orgWithAdmin();
    const offDomains = ltiToolRegistration('https://keys.example.net/jwks', ltiNrps.scope);
    const response = await register(org, offDomains);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_client_metadata', error_description: 'Refused: jwks_uri' });
  });

  // Attack: a grant of a scope no route reads would turn on with the first route that does. Only a read one is recorded,
  // and a registration recorded before that filter, which holds another, still gets only a read one granted.
  it('records only the scopes a route reads, and refuses granting another that a registration holds', async () => {
    const org = await orgWithAdmin();
    const ltiTool = await installLtiTool(org, { scope: `${ltiNrps.scope} organization:read`, approval: null, placed: false });
    const [registered] = await db.select().from(oauthClientsTable).where(eq(oauthClientsTable.id, ltiTool.clientId));
    expect(registered.requestedScopes).toEqual(['user:read']);
    await db
      .update(oauthClientsTable)
      .set({ requestedScopes: ['user:read', 'organization:read'] })
      .where(eq(oauthClientsTable.id, ltiTool.clientId));

    const path = { ...org.path, ltiInstallationId: ltiTool.installationId };
    const approval = { releasedFields: [], grantedScopes: ['organization:read'] satisfies AccessScope[] };
    await expectRefusal(await call(approveLtiInstallation, { path, body: approval, headers: org.headers }), 400, 'lti_scope_not_grantable');
    const approved = await call(approveLtiInstallation, { path, body: { releasedFields: [], grantedScopes: ['user:read'] }, headers: org.headers });
    expect(approved.data).toMatchObject({ grantedScopes: ['user:read'] });
  });

  // Privacy: a row carries the personal fields the installation releases, and nothing else about the person.
  it('answers rows without name, email or picture unless released, and only the name when the name is released', async () => {
    const org = await orgWithAdmin();
    const silent = await installLtiTool(org);
    const named = await installLtiTool(org, { approval: { releasedFields: ['name'], grantedScopes: ['user:read'] } });

    const keysOf = async (ltiTool: LtiTool) => {
      const { data } = await readMembers(org, await tokenOf(ltiTool));
      return (data as Container).members.map((member) => Object.keys(member).sort());
    };
    expect(await keysOf(silent)).toEqual([['roles', 'status', 'user_id']]);
    expect(await keysOf(named)).toEqual([['name', 'roles', 'status', 'user_id']]);
  });

  describe('the token endpoint refuses', () => {
    // Attack: an installation acts only once approved, and stops when disabled, for tokens minted before too.
    it('a pending or disabled installation, and one that asked for no scope', async () => {
      const org = await orgWithAdmin();
      const pending = await installLtiTool(org, { approval: null, placed: false });
      expect(await requestToken(pending)).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
      const unscoped = await installLtiTool(org, { scope: '', approval: { releasedFields: [], grantedScopes: [] } });
      expect(await requestToken(unscoped, { scope: '' })).toMatchObject({ status: 401, body: { error: 'invalid_client' } });

      const ltiTool = await installLtiTool(org);
      const minted = await tokenOf(ltiTool);
      const accountPath = { ...org.path, serviceAccountId: ltiTool.installationId };
      await call(updateServiceAccount, { path: accountPath, body: { status: 'disabled' }, headers: org.headers });
      expect(await requestToken(ltiTool)).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
      await expectRefusal(await readMembers(org, minted), 401, 'unauthorized');
    });

    // Attack: the admin's grant is the most a token carries, whatever the LTI tool asked for, and an unknown scope gets
    // nothing: on the wire an LTI tool names LTI service scopes alone.
    it('a scope asked for but not granted, and one the platform does not know', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org, { scope: `${ltiNrps.scope} organization:read` });
      for (const scope of [`${ltiNrps.scope} organization:read`, `${ltiNrps.scope} label:write`, 'user:read']) {
        expect(await requestToken(ltiTool, { scope })).toMatchObject({ status: 400, body: { error: 'invalid_scope' } });
      }
    });

    // Attack: a grant taken away stops the tokens minted under it at their next request, not at their expiry.
    it('a scope taken away, and stops a token minted before at its next request', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const minted = await tokenOf(ltiTool);
      expect((await readMembers(org, minted)).response.status).toBe(200);

      const path = { ...org.path, ltiInstallationId: ltiTool.installationId };
      const narrowed = await call(updateLtiInstallation, { path, body: { grantedScopes: [] }, headers: org.headers });
      expect(narrowed.data).toMatchObject({ requestedScopes: ['user:read'], grantedScopes: [] });
      await expectRefusal(await readMembers(org, minted), 401, 'unauthorized');
      expect(await requestToken(ltiTool)).toMatchObject({ status: 400, body: { error: 'invalid_scope' } });
    });

    // Attack: only an assertion the registered key signed for this server, once and in time, authenticates; a leaked one
    // cannot wait long for its single use.
    it('an assertion signed by another key, for another audience, expired, expiring too far ahead or used twice', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const refusedAs = { status: 401, body: { error: 'invalid_client' } };

      expect(await requestToken(ltiTool, { key: strangerKey })).toMatchObject(refusedAs);
      expect(await requestToken(ltiTool, { audience: 'https://stranger.example.com/token' })).toMatchObject(refusedAs);
      expect(await requestToken(ltiTool, { audience: [appConfig.oauthUrl, 'https://stranger.example.com/token'] })).toMatchObject(refusedAs);
      expect(await requestToken(ltiTool, { expiresIn: -300 })).toMatchObject(refusedAs);
      expect(await requestToken(ltiTool, { expiresIn: 600 })).toMatchObject(refusedAs);

      const first = await requestToken(ltiTool);
      expect(first.status).toBe(200);
      expect(await requestToken(ltiTool, { assertion: first.assertion })).toMatchObject(refusedAs);
    });

    // Attack: the token endpoint's address the provider builds from a request's host is any host a client sends. The
    // audience is the issuer or the token endpoint as the configuration publishes them, alone or as a one-element list.
    it('an audience at the host a request names, which a forged host header sets, and takes the published addresses', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const refusedAs = { status: 401, body: { error: 'invalid_client' } };

      expect(await requestToken(ltiTool, { audience: `${oauth.issuer}/token` })).toMatchObject(refusedAs);
      const forged = { 'X-Forwarded-Host': 'attacker.example.com', 'X-Forwarded-Proto': 'https' };
      expect(await requestToken(ltiTool, { audience: 'https://attacker.example.com/oauth/token', headers: forged })).toMatchObject(refusedAs);
      // The provider takes the token endpoint only at the host the request names: the public host a proxy forwards.
      const { host, protocol } = new URL(appConfig.oauthUrl);
      const proxied = { 'X-Forwarded-Host': host, 'X-Forwarded-Proto': protocol.replace(':', '') };
      expect((await requestToken(ltiTool, { audience: `${appConfig.oauthUrl}/token`, headers: proxied })).status).toBe(200);
      expect((await requestToken(ltiTool, { audience: [appConfig.oauthUrl] })).status).toBe(200);
    });

    // Attack: a registration acts in its own tenant: it gets no token for another tenant's API, though it may name its own.
    it("a token for another tenant's API, and the token of one tenant at another's route", async () => {
      const org = await orgWithAdmin();
      const other = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const elsewhere = resourceUri({ face: 'api', tenantId: other.org.tenantId });
      expect(await requestToken(ltiTool, { resource: elsewhere })).toMatchObject({ status: 400, body: { error: 'invalid_target' } });
      expect((await requestToken(ltiTool, { resource: resourceUri({ face: 'api', tenantId: org.org.tenantId }) })).status).toBe(200);
      await expectRefusal(await readMembers(other, await tokenOf(ltiTool)), 401, 'unauthorized');
    });
  });

  describe('the members route refuses', () => {
    // Attack: an installation reads only the courses its placements imply. On a course none of them launches as, it is
    // bound to nothing, and the tenant refuses it as any such actor.
    it('a channel the installation is not placed in, or no longer, and a channel of another organization', async () => {
      const org = await orgWithAdmin();
      const other = await orgWithAdmin();
      const ltiTool = await installLtiTool(org, { placed: false });
      const token = await tokenOf(ltiTool);
      await expectRefusal(await readMembers(org, token), 403, 'forbidden');

      ltiTool.resourceLinkId = await placeLtiTool(ltiTool);
      expect((await readMembers(org, token)).response.status).toBe(200);
      expect((await readMembers(org, token, org.org.id.toUpperCase())).response.status).toBe(200);
      await expectRefusal(await readMembers(org, token, other.org.id), 403, 'forbidden');
      const unknownType = `/tenants/${org.org.tenantId}/organizations/${org.org.id}/lti-members/no-such-type/${org.org.id}`;
      await expectRefusal(await baseApp.request(unknownType, { headers: bearerHeaders(token) }), 403, 'forbidden');

      await call(deleteLtiResourceLink, { path: { ...org.path, ltiResourceLinkId: ltiTool.resourceLinkId }, headers: org.headers });
      await expectRefusal(await readMembers(org, token), 403, 'forbidden');
    });

    // Attack: the route is for an installation's token alone; no other proof reads members through it.
    it("an API key, a service account's token and a person's token", async () => {
      const org = await orgWithAdmin();
      await installLtiTool(org);
      const key = await serviceAccountWithKey(org.org, org.admin.sessionCookie, { role: memberRole });
      await expectRefusal(await readMembers(org, key.clientSecret), 401, 'unauthorized');
      const resource = resourceUri({ face: 'api', tenantId: org.org.tenantId });
      const serviceToken = await clientCredentialsToken(oauth.issuer, key, { scope: 'user:read', resource });
      await expectRefusal(await readMembers(org, String(serviceToken.body.access_token)), 401, 'unauthorized');

      const appId = `lti-api-${nanoid(6)}`;
      const redirectUri = 'http://localhost:9999/callback';
      await registerApp({ id: appId, name: 'Portfolio', redirectUris: [redirectUri] });
      await installApp(org.org, org.admin.sessionCookie, appId);
      const consented = await authorizationCodeToken(oauth.issuer, {
        clientId: appId,
        redirectUri,
        scope: 'organization:read',
        resource,
        sessionCookie: org.admin.sessionCookie,
      });
      expect(consented.status).toBe(200);
      await expectRefusal(await readMembers(org, String(consented.body.access_token)), 401, 'unauthorized');
    });

    // Attack: the token opens the routes for installed LTI tools alone, though its course is the organization.
    it("the installation's token on any other route", async () => {
      const org = await orgWithAdmin();
      const token = await tokenOf(await installLtiTool(org));
      await expectRefusal(await call(getOrganization, { path: org.path, headers: bearerHeaders(token) }), 401, 'unauthorized');
    });

    // Attack: whom the installation sees is what its own role there reads, as for a member (member-visibility.test.ts).
    it("everyone when the installation's role reads no people", async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const token = await tokenOf(ltiTool);
      const configured = policyMatrix.user;
      policyMatrix.user = (configured ?? []).map((entry) =>
        entry.channelType === 'organization' && entry.role === memberRole ? { ...entry, permissions: { ...entry.permissions, read: 0 } } : entry,
      );
      try {
        await expectRefusal(await readMembers(org, token), 403, 'forbidden');
      } finally {
        policyMatrix.user = configured;
      }
    });
  });

  describe("a channel's tabs of LTI tools", () => {
    // Contract: a channel's Tabs card shows whether a tab lets an LTI tool read its people, why one cannot be placed and what
    // tells two of one name apart, the LTI tools card every channel where it has a tab, a channel holds one tab of an
    // LTI tool, and a disabled one is placed nowhere and listed only where it has a tab.
    it('lists the LTI tabs of a channel and those of an LTI tool, and refuses a second tab and a disabled LTI tool', async () => {
      const org = await orgWithAdmin();
      const reader = await installLtiTool(org);
      const silent = await installLtiTool(org, { approval: { releasedFields: [], grantedScopes: [] }, placed: false });
      const disabled = await installLtiTool(org);
      const unplaced = await installLtiTool(org, { placed: false });
      for (const { installationId } of [disabled, unplaced])
        await call(updateServiceAccount, {
          path: { ...org.path, serviceAccountId: installationId },
          body: { status: 'disabled' },
          headers: org.headers,
        });
      await installLtiTool(org, { approval: null, placed: false });
      const channel = { channelType: 'organization' as const, channelId: org.org.id };

      const tabs = await call(listLtiTabs, { path: org.path, query: channel, headers: org.headers });
      const tab = { name: 'Peer review', launchOrigins: [`https://${ltiToolHost}`], createdAt: expect.any(String) };
      const placed = (resourceLinkId: string) => ({ id: resourceLinkId, title: 'Peer review', enabled: true, audience: 'members' });
      expect((tabs.data as { results: unknown[] }).results).toEqual([
        { ...tab, id: reader.installationId, status: 'active', readsMembers: true, refusal: null, resourceLink: placed(reader.resourceLinkId) },
        { ...tab, id: silent.installationId, status: 'active', readsMembers: false, refusal: null, resourceLink: null },
        {
          ...tab,
          id: disabled.installationId,
          status: 'disabled',
          readsMembers: true,
          refusal: 'lti_installation_disabled',
          resourceLink: placed(disabled.resourceLinkId),
        },
      ]);
      const body = { ...channel, installationId: unplaced.installationId, title: 'Peer review' };
      await expectRefusal(await call(createLtiResourceLink, { path: org.path, body, headers: org.headers }), 409, 'lti_installation_disabled');

      const path = { ...org.path, ltiInstallationId: reader.installationId };
      const installationTabs = await call(listLtiInstallationTabs, { path, headers: org.headers });
      expect((installationTabs.data as { results: unknown[] }).results).toEqual([
        { id: reader.resourceLinkId, ...channel, channelName: org.org.name, enabled: true, audience: 'members', deletable: true },
      ]);

      const again = { ...channel, installationId: reader.installationId, title: 'Peer review' };
      await expectRefusal(await call(createLtiResourceLink, { path: org.path, body: again, headers: org.headers }), 409, 'resource_already_exists');
    });

    // Attack: an LTI tool gets a tab only in a channel type an admin allowed it in, at approval or later. Taking the type
    // away writes nothing to its tabs: each use asks whether a tab opens. A tab that is on, also one a switch that ran
    // beside the withdrawal turned on, lists to nobody, starts and launches nothing and lets the LTI tool read no one.
    // Allowing the type again opens it.
    it('places an LTI tool only in a channel type an admin allowed, and closes its tabs there while the type is taken away', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org, { allowed: [], placed: false });
      const channel = { channelType: 'organization' as const, channelId: org.org.id };
      const tabs = async () =>
        ((await call(listLtiTabs, { path: org.path, query: channel, headers: org.headers })).data as { results: unknown[] }).results;
      const bar = async () =>
        ((await call(listLtiResourceLinks, { path: org.path, query: channel, headers: org.headers })).data as { results: unknown[] }).results;
      expect(await tabs()).toEqual([]);
      const body = { ...channel, installationId: ltiTool.installationId, title: 'Peer review' };
      await expectRefusal(await call(createLtiResourceLink, { path: org.path, body, headers: org.headers }), 409, 'lti_channel_type_not_allowed');

      const path = { ...org.path, ltiInstallationId: ltiTool.installationId };
      const allow = (channelTypes: 'organization'[]) => call(updateLtiInstallation, { path, body: { channelTypes }, headers: org.headers });
      expect((await allow(['organization'])).data).toMatchObject({ channelTypes: ['organization'] });
      ltiTool.resourceLinkId = await placeLtiTool(ltiTool);
      const token = await tokenOf(ltiTool);
      const linkPath = { ...org.path, ltiResourceLinkId: ltiTool.resourceLinkId };
      const started = await call(startLtiLaunch, { path: linkPath, headers: org.headers });
      expect((await readMembers(org, token)).response.status).toBe(200);

      expect((await allow([])).data).toMatchObject({ channelTypes: [] });
      // The end state of a switch-on that read the LTI tool before the withdrawal and wrote after it.
      await db.update(ltiResourceLinksTable).set({ enabled: true }).where(eq(ltiResourceLinksTable.id, ltiTool.resourceLinkId));
      await expectRefusal(await readMembers(org, token), 403, 'forbidden');
      expect(await bar()).toEqual([]);
      await expectRefusal(await call(startLtiLaunch, { path: linkPath, headers: org.headers }), 409, 'lti_channel_type_not_allowed');
      const launchToken = new URL((started.data as { url: string }).url).searchParams.get('token') ?? '';
      expect(await authorizeLaunch(launchToken)).toMatchObject({ error: 'access_denied' });
      expect(await tabs()).toEqual([
        expect.objectContaining({
          id: ltiTool.installationId,
          refusal: 'lti_channel_type_not_allowed',
          resourceLink: expect.objectContaining({ enabled: true }),
        }),
      ]);
      const switchOff = { path: linkPath, body: { enabled: false }, headers: org.headers };
      expect((await call(updateLtiResourceLink, switchOff)).data).toMatchObject({ enabled: false });
      await expectRefusal(await call(updateLtiResourceLink, { ...switchOff, body: { enabled: true } }), 409, 'lti_channel_type_not_allowed');

      expect((await allow(['organization'])).data).toMatchObject({ channelTypes: ['organization'] });
      expect((await call(updateLtiResourceLink, { ...switchOff, body: { enabled: true } })).data).toMatchObject({ enabled: true });
      expect((await readMembers(org, token)).response.status).toBe(200);
    });

    // Contract: an LTI tool keys what it stores by the resource link id, which switching a tab off and on keeps.
    // Attack: a tab switched off opens nothing, lets the LTI tool read no one, for a token minted while it was on too, and
    // is listed to none of the channel's readers.
    it('keeps the resource link of a tab switched off and on, and refuses its launch and its members while it is off', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const token = await tokenOf(ltiTool);
      const linkPath = { ...org.path, ltiResourceLinkId: ltiTool.resourceLinkId };
      const switchTab = (enabled: boolean) => call(updateLtiResourceLink, { path: linkPath, body: { enabled }, headers: org.headers });

      expect((await switchTab(false)).data).toMatchObject({ id: ltiTool.resourceLinkId, enabled: false });
      await expectRefusal(await readMembers(org, token), 403, 'forbidden');
      const barQuery = { channelType: 'organization' as const, channelId: org.org.id };
      const bar = await call(listLtiResourceLinks, { path: org.path, query: barQuery, headers: org.headers });
      expect((bar.data as { results: unknown[] }).results).toEqual([]);
      const launch = await call(startLtiLaunch, { path: linkPath, headers: org.headers });
      await expectRefusal(launch, 409, 'lti_tab_switched_off');

      expect((await switchTab(true)).data).toMatchObject({ id: ltiTool.resourceLinkId, enabled: true });
      expect((await readMembers(org, token)).response.status).toBe(200);
    });

    // Attack: only an organization admin who stepped up deletes an LTI tool, and only one of their own tenant. A deleted
    // LTI tool keeps nothing: a token minted before is refused, its tabs are gone, and its old tab and a launch started
    // there answer as a tab that does not exist.
    it('deletes an LTI tool with its tabs, launches and tokens for an admin who stepped up, and refuses anyone else', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const token = await tokenOf(ltiTool);
      const linkPath = { ...org.path, ltiResourceLinkId: ltiTool.resourceLinkId };
      const started = await call(startLtiLaunch, { path: linkPath, headers: org.headers });
      const launchToken = new URL((started.data as { url: string }).url).searchParams.get('token') ?? '';
      const path = { ...org.path, ltiInstallationId: ltiTool.installationId };

      const member = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
      const asMember = { ...defaultHeaders, Cookie: member.sessionCookie };
      await expectRefusal(await call(deleteLtiInstallation, { path, headers: asMember }), 403, 'forbidden');
      const stale = await insertStaleSession(org.admin);
      await expectRefusal(await call(deleteLtiInstallation, { path, headers: stale.headers }), 403, 'step_up_required');
      const other = await orgWithAdmin();
      const elsewhere = { ...other.path, ltiInstallationId: ltiTool.installationId };
      await expectRefusal(await call(deleteLtiInstallation, { path: elsewhere, headers: other.headers }), 404, 'not_found');
      expect((await readMembers(org, token)).response.status).toBe(200);

      expect((await call(deleteLtiInstallation, { path, headers: org.headers })).response.status).toBe(204);
      await expectRefusal(await readMembers(org, token), 401, 'unauthorized');
      const channel = { channelType: 'organization' as const, channelId: org.org.id };
      const bar = await call(listLtiResourceLinks, { path: org.path, query: channel, headers: org.headers });
      expect((bar.data as { results: unknown[] }).results).toEqual([]);
      await expectRefusal(await call(startLtiLaunch, { path: linkPath, headers: org.headers }), 404, 'not_found');
      const page = await baseApp.fetch(new Request(`http://localhost/lti-launches/~initiate-login?token=${launchToken}`));
      expect(page.status).toBe(401);

      // A waiting one too, which its tile rejects
      const waiting = await installLtiTool(org, { approval: null, placed: false });
      const waitingPath = { ...org.path, ltiInstallationId: waiting.installationId };
      expect((await call(deleteLtiInstallation, { path: waitingPath, headers: org.headers })).response.status).toBe(204);
      const listed = await call(listLtiInstallations, { path: org.path, headers: org.headers });
      expect((listed.data as { results: unknown[] }).results).toEqual([]);
    });

    // Attack: only who may update the channel places a tab, switches or removes it, sees what it may place there, or lists
    // where an LTI tool has tabs. A tab lets the LTI tool read the course's people.
    it('refuses a member who may not update the channel', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const member = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
      const headers = { ...defaultHeaders, Cookie: member.sessionCookie };
      const channel = { channelType: 'organization' as const, channelId: org.org.id };

      await expectRefusal(await call(listLtiTabs, { path: org.path, query: channel, headers }), 403, 'forbidden');
      const body = { ...channel, installationId: ltiTool.installationId, title: 'Peer review' };
      await expectRefusal(await call(createLtiResourceLink, { path: org.path, body, headers }), 403, 'forbidden');
      const linkPath = { ...org.path, ltiResourceLinkId: ltiTool.resourceLinkId };
      await expectRefusal(await call(updateLtiResourceLink, { path: linkPath, body: { enabled: false }, headers }), 403, 'forbidden');
      await expectRefusal(await call(deleteLtiResourceLink, { path: linkPath, headers }), 403, 'forbidden');
      const path = { ...org.path, ltiInstallationId: ltiTool.installationId };
      await expectRefusal(await call(listLtiInstallationTabs, { path, headers }), 403, 'forbidden');
    });
  });
});
