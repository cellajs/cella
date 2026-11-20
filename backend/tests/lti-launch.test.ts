import { and, eq, sql } from 'drizzle-orm';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createLtiResourceLink,
  listLtiResourceLinks,
  startLtiLaunch,
  startLtiToolRegistration,
  updateLtiResourceLink,
} from 'sdk';
import { appConfig } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { lisContextRoles, lisContextTypes, lisInstitutionRoles, ltiClaims, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { tokensTable } from '#/modules/auth/core/tokens/tokens-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession, expectRefusal } from './helpers';
import { parseForm, sendLtiAuthenticationRequest, startTestOauthServer, type TestOauthServer } from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser } from './security/helpers';
import { createAppClient } from './test-client';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are.
vi.mock('#/modules/auth/flows/lti/lti-context-channel', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLtiContextChannel(await importOriginal()),
);
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

overrideConfig(appConfig.has, { ltiPlatform: true });

/** A Dynamic Registration request of a fake LTI tool on `host`; it asks for name and email claims. */
const fakeLtiTool = (host: string) => ({
  application_type: 'web',
  grant_types: ['client_credentials', 'implicit'],
  response_types: ['id_token'],
  token_endpoint_auth_method: 'private_key_jwt',
  client_name: 'Peer review',
  initiate_login_uri: `https://${host}/login`,
  redirect_uris: [`https://${host}/launch`],
  jwks_uri: `https://${host}/jwks`,
  [ltiToolConfigurationMember]: {
    domain: host,
    target_link_uri: `https://${host}/launch`,
    claims: ['iss', 'sub', 'name', 'email'],
    messages: [{ type: 'LtiResourceLinkRequest' }],
  },
});

describe('LTI launch', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let oauth: TestOauthServer;

  beforeAll(async () => {
    oauth = await startTestOauthServer();
  });

  afterAll(async () => await oauth.close());

  afterEach(async () => await clearSecurityTestData());

  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, adminRole);
    const path = { tenantId: org.tenantId, organizationId: org.id };
    return { org, path, headers: { ...defaultHeaders, Cookie: admin.sessionCookie }, admin };
  }

  type Org = Awaited<ReturnType<typeof orgWithAdmin>>;

  /** Registers a fake LTI tool on `host` in the organization's tenant; approves it with `releasedFields` unless null. */
  async function installTool(org: Org, host: string, releasedFields: ('name' | 'email')[] | null = []) {
    const started = await call(startLtiToolRegistration, {
      path: org.path,
      body: { registrationUrl: `https://${host}/register` },
      headers: org.headers,
    });
    const token = new URL((started.data as { url: string }).url).searchParams.get('registration_token') ?? '';
    const response = await fetch(`${oauth.issuer}/lti/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(fakeLtiTool(host)),
    });
    const registered = (await response.json()) as { client_id: string; [ltiToolConfigurationMember]: { deployment_id: string } };
    const installationId = registered[ltiToolConfigurationMember].deployment_id;
    if (releasedFields) {
      await call(approveLtiInstallation, {
        path: { ...org.path, ltiInstallationId: installationId },
        body: { releasedFields, channelTypes: ['organization'] },
        headers: org.headers,
      });
    }
    return { clientId: registered.client_id, installationId, redirectUri: `https://${host}/launch` };
  }

  type Tool = Awaited<ReturnType<typeof installTool>>;

  async function placeTool(org: Org, tool: Tool) {
    const created = await call(createLtiResourceLink, {
      path: org.path,
      body: { channelType: 'organization', channelId: org.org.id, installationId: tool.installationId, title: 'Peer review', custom: { round: '1' } },
      headers: org.headers,
    });
    return (created.data as { id: string }).id;
  }

  /** Starts a launch as the session of `cookie` and loads its login initiation page, as the frame does. */
  async function startLaunch(org: Org, resourceLinkId: string, cookie = org.admin.sessionCookie) {
    const started = await call(startLtiLaunch, {
      path: { ...org.path, ltiResourceLinkId: resourceLinkId },
      headers: { ...defaultHeaders, Cookie: cookie },
    });
    const token = new URL((started.data as { url: string }).url).searchParams.get('token') ?? '';
    const page = await baseApp.fetch(new Request(`http://localhost/lti-launches/~initiate-login?token=${token}`));
    return { page, login: parseForm(await page.text()), cookie };
  }

  type StartedLaunch = Awaited<ReturnType<typeof startLaunch>>;

  /**
   * What the fake LTI tool sends the browser to: the authentication request of a started launch's login fields, with
   * `changes` over it, in the browser that holds `browserCookie`, by default the one that started the launch; null is a
   * browser without a session.
   */
  async function authorize(
    { login, cookie }: StartedLaunch,
    redirectUri: string,
    changes: Record<string, string | undefined> = {},
    browserCookie: string | null = cookie,
  ) {
    const params = {
      scope: 'openid',
      response_type: 'id_token',
      response_mode: 'form_post',
      prompt: 'none',
      client_id: login.fields.client_id,
      redirect_uri: redirectUri,
      login_hint: login.fields.login_hint,
      lti_message_hint: login.fields.lti_message_hint,
      nonce: nanoid(),
      state: nanoid(),
      ...changes,
    };
    const query = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])));
    return { params, ...(await sendLtiAuthenticationRequest(oauth.issuer, query, browserCookie ?? undefined)) };
  }

  // Commit 4's LTI tool verifies these tokens: the claims LTI Core requires and the ones the app-owned file decides.
  it('launches with an ID token the issuer key set verifies, carrying the required claims and no personal field unless released', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const resourceLinkId = await placeTool(org, tool);

    const started = await startLaunch(org, resourceLinkId);
    const { page, login } = started;
    expect(page.status).toBe(200);
    expect(login.action).toBe('https://peer-review.example.com/login?lti_storage_target=_parent');
    expect(login.fields).toMatchObject({
      iss: appConfig.oauthUrl,
      client_id: tool.clientId,
      lti_deployment_id: tool.installationId,
      lti_storage_target: '_parent',
    });

    const launch = await authorize(started, tool.redirectUri);
    expect(launch.action).toBe(tool.redirectUri);
    expect(launch.fields.state).toBe(launch.params.state);
    const keySet = createRemoteJWKSet(new URL(`${oauth.issuer}/jwks`));
    const { payload, protectedHeader } = await jwtVerify(launch.fields.id_token, keySet, { issuer: appConfig.oauthUrl, audience: tool.clientId });

    expect(protectedHeader).toMatchObject({ alg: 'RS256', kid: expect.any(String) });
    expect(payload).toMatchObject({
      sub: org.admin.id,
      nonce: launch.params.nonce,
      exp: expect.any(Number),
      iat: expect.any(Number),
      [ltiClaims.messageType]: 'LtiResourceLinkRequest',
      [ltiClaims.version]: '1.3.0',
      [ltiClaims.deploymentId]: tool.installationId,
      [ltiClaims.targetLinkUri]: login.fields.target_link_uri,
      [ltiClaims.resourceLink]: { id: resourceLinkId, title: 'Peer review' },
      [ltiClaims.roles]: [lisContextRoles.instructor, lisInstitutionRoles.administrator],
      [ltiClaims.context]: { id: org.org.id, type: [lisContextTypes.group] },
      [ltiClaims.custom]: { round: '1' },
      [ltiClaims.toolPlatform]: { guid: org.org.tenantId },
    });
    for (const claim of ['name', 'given_name', 'family_name', 'email', 'picture']) expect(payload).not.toHaveProperty(claim);

    // An approval that releases the name releases its claims the LTI tool asked for, and nothing else.
    const named = await installTool(org, 'named.example.com', ['name']);
    const namedLaunch = await authorize(await startLaunch(org, await placeTool(org, named)), named.redirectUri);
    const { payload: namedPayload } = await jwtVerify(namedLaunch.fields.id_token, keySet, { issuer: appConfig.oauthUrl, audience: named.clientId });
    expect(namedPayload.name).toEqual(expect.any(String));
    for (const claim of ['given_name', 'family_name', 'email', 'picture']) expect(namedPayload).not.toHaveProperty(claim);
  });

  it('refuses in place a redirect_uri the client did not register, and posts every later refusal back with its state', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const started = await startLaunch(org, await placeTool(org, tool));

    const unregistered = await authorize(started, 'https://stranger.example.com/launch');
    expect(unregistered.response.status).toBe(400);
    expect(unregistered.action).toBe('');

    const noNonce = await authorize(started, tool.redirectUri, { nonce: undefined });
    expect(noNonce.action).toBe(tool.redirectUri);
    expect(noNonce.fields).toMatchObject({ error: 'invalid_request', state: noNonce.params.state });
    expect(noNonce.fields).not.toHaveProperty('id_token');

    // Neither refusal spent the record.
    expect((await authorize(started, tool.redirectUri)).fields).toHaveProperty('id_token');
  });

  it('spends a launch record once, and only for the registration it was started for', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const other = await installTool(org, 'other-tool.example.com');
    const resourceLinkId = await placeTool(org, tool);

    const started = await startLaunch(org, resourceLinkId);
    expect((await authorize(started, tool.redirectUri)).fields).toHaveProperty('id_token');
    expect((await authorize(started, tool.redirectUri)).fields).toMatchObject({ error: 'login_required' });
    // The login initiation page of a spent record is refused too.
    const reloaded = await baseApp.fetch(new Request(`http://localhost/lti-launches/~initiate-login?token=${started.login.fields.lti_message_hint}`));
    expect(reloaded.status).toBe(401);

    const second = await startLaunch(org, resourceLinkId);
    const foreign = await authorize(second, other.redirectUri, { client_id: other.clientId });
    expect(foreign.fields).toMatchObject({ error: 'login_required' });
    expect(foreign.fields).not.toHaveProperty('id_token');
  });

  // Attack: both hints pass through the LTI tool. A member who starts a launch and has another person's browser run
  // the login with it would sign that person in to a cookie based LTI tool as the member. The endpoint issues the
  // token only to the session that started the launch (Security Framework 1.1, section 5.1.1.3).
  it('issues the ID token only in the browser session that started the launch', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const resourceLinkId = await placeTool(org, tool);
    const otherPerson = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
    const started = await startLaunch(org, resourceLinkId);

    // A browser without a session, another person's, and another browser of the same person.
    for (const browser of [null, otherPerson.sessionCookie, await createTestSession(org.admin)]) {
      const launch = await authorize(started, tool.redirectUri, {}, browser);
      expect(launch.action).toBe(tool.redirectUri);
      expect(launch.fields).toMatchObject({ error: 'login_required', state: launch.params.state });
      expect(launch.fields).not.toHaveProperty('id_token');
    }

    // None of them spent the record: the browser that started the launch still gets its token.
    const own = await authorize(started, tool.redirectUri);
    expect(decodeJwt(own.fields.id_token).sub).toBe(org.admin.id);
  });

  it('refuses a launch once the installation is disabled or waits for approval, and placing a pending one', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const resourceLinkId = await placeTool(org, tool);

    for (const values of [{ status: 'disabled' as const }, { status: 'pending' as const }]) {
      const started = await startLaunch(org, resourceLinkId);
      await db.update(serviceAccountsTable).set(values).where(eq(serviceAccountsTable.id, tool.installationId));
      expect((await authorize(started, tool.redirectUri)).fields, values.status).toMatchObject({ error: 'unauthorized_client' });
      await db.update(serviceAccountsTable).set({ status: 'active' }).where(eq(serviceAccountsTable.id, tool.installationId));
    }

    const pending = await installTool(org, 'pending.example.com', null);
    const placed = await call(createLtiResourceLink, {
      path: org.path,
      body: { channelType: 'organization', channelId: org.org.id, installationId: pending.installationId, title: 'Pending' },
      headers: org.headers,
    });
    await expectRefusal(placed, 409, 'lti_installation_not_approved');
  });

  it('refuses a start by someone who cannot read the channel, and a launch by someone removed since the start', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const resourceLinkId = await placeTool(org, tool);

    const outsider = await orgWithAdmin();
    const refused = await call(startLtiLaunch, { path: { ...org.path, ltiResourceLinkId: resourceLinkId }, headers: outsider.headers });
    expect(refused.response.status).toBe(403);
    expect(await db.select().from(tokensTable).where(eq(tokensTable.kind, 'lti-launch'))).toHaveLength(0);

    // A member who may only read the context launches as a Learner, with no institution role.
    const member = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
    const learner = await authorize(await startLaunch(org, resourceLinkId, member.sessionCookie), tool.redirectUri);
    expect(decodeJwt(learner.fields.id_token)[ltiClaims.roles]).toEqual([lisContextRoles.learner]);

    const started = await startLaunch(org, resourceLinkId, member.sessionCookie);
    await db.delete(membershipsTable).where(and(eq(membershipsTable.userId, member.id), eq(membershipsTable.channelId, org.org.id)));
    const launch = await authorize(started, tool.redirectUri);
    expect(launch.fields).toMatchObject({ error: 'access_denied' });
    expect(launch.fields).not.toHaveProperty('id_token');
  });

  // Attack: a tab opens for its audience alone, and its list, its start and its launch decide alike. A system admin's
  // power opens no tab: a launch judges the person's own memberships, and one without a membership is refused at the
  // list and the start as for a tab that does not exist. A tab for its editors is not for a member who may only read it,
  // also for a launch the member started before, and an audience the app does not know opens for nobody.
  it('lists, starts and launches a tab for its audience alone', async () => {
    const org = await orgWithAdmin();
    const tool = await installTool(org, 'peer-review.example.com');
    const resourceLinkId = await placeTool(org, tool);
    const linkPath = { ...org.path, ltiResourceLinkId: resourceLinkId };
    const listed = async (headers: Record<string, string>) => {
      const query = { channelType: 'organization' as const, channelId: org.org.id };
      return ((await call(listLtiResourceLinks, { path: org.path, query, headers })).data as { results: { id: string }[] }).results.map(
        ({ id }) => id,
      );
    };

    const systemAdmin = await createSystemAdminUser(`lti-${nanoid(8)}@test.com`);
    const asSystemAdmin = { ...defaultHeaders, Cookie: await createTestSession(systemAdmin) };
    expect(await listed(asSystemAdmin)).toEqual([]);
    await expectRefusal(await call(startLtiLaunch, { path: linkPath, headers: asSystemAdmin }), 404, 'not_found');

    const member = await createFactorOrgUser(call, org.org.tenantId, org.org.id, `lti-${nanoid(8)}`, memberRole);
    const asMember = { ...defaultHeaders, Cookie: member.sessionCookie };
    expect(await listed(asMember)).toEqual([resourceLinkId]);
    const started = await startLaunch(org, resourceLinkId, member.sessionCookie);
    const changed = await call(updateLtiResourceLink, { path: linkPath, body: { audience: 'editors' }, headers: org.headers });
    expect(changed.data).toMatchObject({ id: resourceLinkId, audience: 'editors' });

    expect((await authorize(started, tool.redirectUri)).fields).toMatchObject({ error: 'access_denied' });
    expect(await listed(asMember)).toEqual([]);
    await expectRefusal(await call(startLtiLaunch, { path: linkPath, headers: asMember }), 404, 'not_found');
    expect(await listed(org.headers)).toEqual([resourceLinkId]);
    expect((await authorize(await startLaunch(org, resourceLinkId), tool.redirectUri)).fields).toHaveProperty('id_token');

    await db.execute(sql`UPDATE lti_resource_links SET audience = 'everyone' WHERE id = ${resourceLinkId}`);
    expect(await listed(org.headers)).toEqual([]);
  });
});
