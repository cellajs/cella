import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createLtiResourceLink,
  deleteLtiResourceLink,
  getOrganization,
  listLtiMembers,
  startLtiLaunch,
  startLtiToolRegistration,
  updateLtiInstallation,
  updateServiceAccount,
} from 'sdk';
import { type AccessScope, appConfig, policyMatrix } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lisContextRoles, ltiApiClaim, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { resourceUri } from '#/modules/oauth-server/resources';
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
import { createAppClient } from './test-client';

overrideConfig(appConfig.has, { ltiPlatform: true });

const ltiToolHost = 'peer-review.example.com';
const launchUri = `https://${ltiToolHost}/launch`;

/** A Dynamic Registration request of a fake LTI tool whose keys `jwksUri` serves, asking for `scope`. */
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

type Row = { id: string; roles: string[]; name?: string; email?: string; picture?: string };
type Page = { results: Row[]; nextPageToken?: string; totalSize: number };

/**
 * An installed LTI tool reads the people of a channel it is placed in through the platform's API, with a token for
 * its registered key, within the scopes an admin granted.
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
    placed?: boolean;
  }

  /** Registers the fake LTI tool in the organization's tenant, approves it and places it in the organization. */
  async function installLtiTool(
    org: Org,
    { scope = 'user:read', approval = { releasedFields: [], grantedScopes: ['user:read'] }, placed = true }: InstallOptions = {},
  ) {
    const started = await call(startLtiToolRegistration, {
      path: org.path,
      body: { registrationUrl: `https://${ltiToolHost}/register` },
      headers: org.headers,
    });
    const registrationToken = new URL((started.data as { url: string }).url).searchParams.get('registration_token') ?? '';
    const response = await fetch(`${oauth.issuer}/lti/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registrationToken}` },
      body: JSON.stringify(ltiToolRegistration(jwksUri, scope)),
    });
    const registered = (await response.json()) as { client_id: string; [ltiToolConfigurationMember]: { deployment_id: string } };
    const installationId = registered[ltiToolConfigurationMember].deployment_id;
    if (approval)
      await call(approveLtiInstallation, { path: { ...org.path, ltiInstallationId: installationId }, body: approval, headers: org.headers });
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
    audience?: string;
    /** Seconds from now; a negative value makes an expired assertion. */
    expiresIn?: number;
    assertion?: string;
  }

  /** The LTI tool's `client_credentials` request, authenticated with an assertion signed by `key` (`private_key_jwt`). */
  async function requestToken(
    ltiTool: LtiTool,
    { scope = 'user:read', resource, key = ltiToolKey, audience = appConfig.oauthUrl, expiresIn = 120, assertion }: TokenRequest = {},
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: signed,
        scope,
        resource: resource ?? resourceUri({ face: 'api', tenantId: ltiTool.org.org.tenantId }),
      }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, assertion: signed };
  }

  const tokenOf = async (ltiTool: LtiTool, request?: TokenRequest) => {
    const answer = await requestToken(ltiTool, request);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    return String(answer.body.access_token);
  };

  const readMembers = (org: Org, token: string, channelId = org.org.id) =>
    call(listLtiMembers, { path: org.path, query: { channelType: 'organization', channelId }, headers: bearerHeaders(token) });

  /** A launch of the resource link by `cookie`'s person, through the issuer, as the frame and the LTI tool run it. */
  async function launch(ltiTool: LtiTool, cookie = ltiTool.org.admin.sessionCookie) {
    const started = await call(startLtiLaunch, {
      path: { ...ltiTool.org.path, ltiResourceLinkId: ltiTool.resourceLinkId },
      headers: { ...defaultHeaders, Cookie: cookie },
    });
    const launchToken = new URL((started.data as { url: string }).url).searchParams.get('token') ?? '';
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
    return decodeJwt(parseForm(await response.text()).fields.id_token);
  }

  // Contract: the LTI tool's reader of the next commit reads the claim, requests the token and pages the members.
  it('names the API in the launch, and a token for the registered key reads the channel members with their LTI roles, paged', async () => {
    const org = await orgWithAdmin();
    const member = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
    const ltiTool = await installLtiTool(org);

    const claim = (await launch(ltiTool))[ltiApiClaim(appConfig.oauthUrl)] as Record<string, string>;
    const apiUrl = resourceUri({ face: 'api', tenantId: org.org.tenantId });
    expect(claim).toEqual({
      api_url: apiUrl,
      tenant_id: org.org.tenantId,
      organization_id: org.org.id,
      channel_type: 'organization',
      channel_id: org.org.id,
      members_url: `${apiUrl}/organizations/${org.org.id}/lti-members?channelType=organization&channelId=${org.org.id}`,
    });

    const answer = await requestToken(ltiTool, { resource: claim.api_url });
    expect(answer).toMatchObject({ status: 200, body: { token_type: 'Bearer', scope: 'user:read' } });
    expect(decodeJwt(String(answer.body.access_token))).toMatchObject({
      actor_kind: 'service',
      installation_id: ltiTool.installationId,
      client_id: ltiTool.clientId,
    });

    const readPage = async (pageToken?: string): Promise<Page> => {
      const url = new URL(claim.members_url);
      url.searchParams.set('maxPageSize', '1');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await baseApp.request(`${url.pathname}${url.search}`, { headers: bearerHeaders(String(answer.body.access_token)) });
      expect(response.status).toBe(200);
      return response.json();
    };
    const first = await readPage();
    expect(first.results).toHaveLength(1);
    expect(first.totalSize).toBe(2);
    const second = await readPage(first.nextPageToken);
    expect(second.nextPageToken).toBeUndefined();
    const rows = [...first.results, ...second.results].sort((a, b) => a.id.localeCompare(b.id));
    const expected = [
      { id: org.admin.id, roles: [lisContextRoles.instructor] },
      { id: member.id, roles: [lisContextRoles.learner] },
    ].sort((a, b) => a.id.localeCompare(b.id));
    expect(rows).toEqual(expected);
  });

  // Privacy: a row carries the personal fields the installation releases, and nothing else about the person.
  it('answers rows without name, email or picture unless released, and only the name when the name is released', async () => {
    const org = await orgWithAdmin();
    const silent = await installLtiTool(org);
    const named = await installLtiTool(org, { approval: { releasedFields: ['name'], grantedScopes: ['user:read'] } });

    const keysOf = async (ltiTool: LtiTool) => {
      const { data } = await readMembers(org, await tokenOf(ltiTool));
      return (data as Page).results.map((row) => Object.keys(row).sort());
    };
    expect(await keysOf(silent)).toEqual([['id', 'roles']]);
    expect(await keysOf(named)).toEqual([['id', 'name', 'roles']]);
  });

  describe('the token endpoint refuses', () => {
    // Attack: an installation acts only once approved, and stops when disabled, for tokens minted before too.
    it('a pending or disabled installation', async () => {
      const org = await orgWithAdmin();
      const pending = await installLtiTool(org, { approval: null, placed: false });
      expect(await requestToken(pending)).toMatchObject({ status: 401, body: { error: 'invalid_client' } });

      const ltiTool = await installLtiTool(org);
      const minted = await tokenOf(ltiTool);
      const accountPath = { ...org.path, serviceAccountId: ltiTool.installationId };
      await call(updateServiceAccount, { path: accountPath, body: { status: 'disabled' }, headers: org.headers });
      expect(await requestToken(ltiTool)).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
      await expectRefusal(await readMembers(org, minted), 401, 'unauthorized');
    });

    // Attack: the admin's grant is the most a token carries, whatever the LTI tool asked for, and an unknown scope gets nothing.
    it('a scope asked for but not granted, and one the platform does not know', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org, { scope: 'user:read organization:read' });
      expect(await requestToken(ltiTool, { scope: 'user:read organization:read' })).toMatchObject({ status: 400, body: { error: 'invalid_scope' } });
      expect(await requestToken(ltiTool, { scope: 'user:read label:write' })).toMatchObject({ status: 400, body: { error: 'invalid_scope' } });
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

    // Attack: only an assertion the registered key signed for this server, once and in time, authenticates.
    it('an assertion signed by another key, for another audience, expired or used twice', async () => {
      const org = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const refusedAs = { status: 401, body: { error: 'invalid_client' } };

      expect(await requestToken(ltiTool, { key: strangerKey })).toMatchObject(refusedAs);
      expect(await requestToken(ltiTool, { audience: 'https://stranger.example.com/token' })).toMatchObject(refusedAs);
      expect(await requestToken(ltiTool, { expiresIn: -300 })).toMatchObject(refusedAs);

      const first = await requestToken(ltiTool);
      expect(first.status).toBe(200);
      expect(await requestToken(ltiTool, { assertion: first.assertion })).toMatchObject(refusedAs);
    });

    // Attack: a registration acts in its own tenant: it gets no token for another tenant's API.
    it("a token for another tenant's API, and the token of one tenant at another's route", async () => {
      const org = await orgWithAdmin();
      const other = await orgWithAdmin();
      const ltiTool = await installLtiTool(org);
      const elsewhere = resourceUri({ face: 'api', tenantId: other.org.tenantId });
      expect(await requestToken(ltiTool, { resource: elsewhere })).toMatchObject({ status: 400, body: { error: 'invalid_target' } });
      await expectRefusal(await readMembers(other, await tokenOf(ltiTool)), 401, 'unauthorized');
    });
  });

  describe('the members route refuses', () => {
    // Attack: an installation reads only the channels it is placed in, though it holds its organization role from the start.
    it('a channel the installation is not placed in, or no longer, and a channel of another organization', async () => {
      const org = await orgWithAdmin();
      const other = await orgWithAdmin();
      const ltiTool = await installLtiTool(org, { placed: false });
      const token = await tokenOf(ltiTool);
      await expectRefusal(await readMembers(org, token), 404, 'not_found');

      ltiTool.resourceLinkId = await placeLtiTool(ltiTool);
      expect((await readMembers(org, token)).response.status).toBe(200);
      await expectRefusal(await readMembers(org, token, other.org.id), 404, 'not_found');

      await call(deleteLtiResourceLink, { path: { ...org.path, ltiResourceLinkId: ltiTool.resourceLinkId }, headers: org.headers });
      await expectRefusal(await readMembers(org, token), 404, 'not_found');
    });

    // Attack: the route is for an installation's token alone; no other proof reads members through it.
    it("an API key, a service account's token and a person's token", async () => {
      const org = await orgWithAdmin();
      await installLtiTool(org);
      const key = await serviceAccountWithKey(org.org, org.admin.sessionCookie, { role: memberRole, scopes: ['user:read'] });
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
        scope: 'user:read',
        resource,
        sessionCookie: org.admin.sessionCookie,
      });
      expect(consented.status).toBe(200);
      await expectRefusal(await readMembers(org, String(consented.body.access_token)), 401, 'unauthorized');
    });

    // Attack: the token opens this route alone, though the installation's role reads the organization and the scope allows it.
    it("the installation's token on any other route", async () => {
      const org = await orgWithAdmin();
      const approval = { releasedFields: [], grantedScopes: ['user:read', 'organization:read'] satisfies AccessScope[] };
      const ltiTool = await installLtiTool(org, { scope: 'user:read organization:read', approval });
      const token = await tokenOf(ltiTool, { scope: 'user:read organization:read' });
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
});
