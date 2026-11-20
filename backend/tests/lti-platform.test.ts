import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  approveLtiInstallation,
  createApiKey,
  createLtiRegistrationLink,
  deleteLtiInstallation,
  listLtiInstallations,
  startLtiToolRegistration,
  updateServiceAccount,
} from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { ltiToolConfigurationMember } from '#/lib/lti-vocabulary';
import { tokensTable } from '#/modules/auth/core/tokens/tokens-db';
import { ltiKeySetUrl, ltiRegistrationRequest } from '#/modules/auth/flows/lti/helpers/registration-request';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { grantRefusal } from '#/modules/oauth-server/grant-policy';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from './fixtures';
import { createTestOrganization, expectRefusal } from './helpers';
import { startAuthorization, startTestOauthServer, type TestOauthServer } from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are.
vi.mock('#/modules/auth/flows/lti/lti-context-channel', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLtiContextChannel(await importOriginal()),
);
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

// The app takes both LTI roles: the round trip registers it with itself.
setTestConfig({ enabledAuthStrategies: ['passkey', 'lti'] });
overrideConfig(appConfig.has, { ltiPlatform: true });

const toolRegistrationUrl = 'https://peer-review.example.com/lti/register?course=7';

describe('LTI platform', async () => {
  const call = await createAppClient();
  let oauth: TestOauthServer;

  beforeAll(async () => {
    oauth = await startTestOauthServer();
  });

  afterAll(async () => await oauth.close());

  afterEach(async () => await clearSecurityTestData());

  async function orgWithUser(role = adminRole) {
    const org = await createTestOrganization();
    const user = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, role);
    return { org, user, path: { tenantId: org.tenantId, organizationId: org.id }, headers: { ...defaultHeaders, Cookie: user.sessionCookie } };
  }

  type OrgUser = Awaited<ReturnType<typeof orgWithUser>>;

  async function startRegistration({ path, headers }: OrgUser, registrationUrl = toolRegistrationUrl) {
    const answer = await call(startLtiToolRegistration, { path, body: { registrationUrl }, headers });
    const started = answer.data as { url: string } | undefined;
    const url = started ? new URL(started.url) : null;
    return { answer, url, token: url?.searchParams.get('registration_token') ?? '' };
  }

  /** An LTI tool posting its registration to the worker, as the app itself registers. */
  const register = (token: string, body: object = ltiRegistrationRequest(generateId(), appConfig.slug)) =>
    fetch(`${oauth.issuer}/lti/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  async function pendingInstallation(admin: OrgUser) {
    const response = await register((await startRegistration(admin)).token);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { client_id: string; [ltiToolConfigurationMember]: { deployment_id: string } };
    return { clientId: body.client_id, installationId: body[ltiToolConfigurationMember].deployment_id };
  }

  const installationPath = (admin: OrgUser, ltiInstallationId: string) => ({ ...admin.path, ltiInstallationId });

  // The contract the launch builds on: each side holds the other's issuer, client id and LTI deployment.
  it('registers the app with itself: a connection on the tool side, a private registration and a pending installation on the platform side', async () => {
    const toolAdmin = await orgWithUser();
    const platformAdmin = await orgWithUser();
    const link = await call(createLtiRegistrationLink, { path: toolAdmin.path, headers: toolAdmin.headers });
    const { url } = await startRegistration(platformAdmin, (link.data as { url: string } | undefined)?.url);
    expect(url?.searchParams.get('openid_configuration')).toBe(`${appConfig.oauthUrl}/lti/openid-configuration`);

    // The worker answers in-process, on its own listener, at the addresses the configuration names.
    const transport: GuardedTransport = ({ url: target, method, headers, body }) =>
      fetch(new URL(`${target.pathname}${target.search}`, oauth.issuer), { method, headers, body, redirect: 'manual' });
    const connection = await registerLtiPlatformOp(
      {
        link: url?.searchParams.get('link') ?? '',
        openid_configuration: url?.searchParams.get('openid_configuration') ?? '',
        registration_token: url?.searchParams.get('registration_token') ?? undefined,
      },
      { transport, resolve: async () => [{ address: '127.0.0.1', family: 4 }] },
    );

    const [account] = await db
      .select()
      .from(serviceAccountsTable)
      .where(eq(serviceAccountsTable.oauthClientId, connection.clientId ?? ''));
    expect(connection).toMatchObject({ tenantId: toolAdmin.org.tenantId, issuer: appConfig.oauthUrl, config: { deploymentIds: [account.id] } });
    expect(account).toMatchObject({ tenantId: platformAdmin.org.tenantId, status: 'pending', createdBy: platformAdmin.user.id });

    const [client] = await db
      .select()
      .from(oauthClientsTable)
      .where(eq(oauthClientsTable.id, account.oauthClientId ?? ''));
    expect(client).toMatchObject({
      tenantId: platformAdmin.org.tenantId,
      initiateLoginUri: `${appConfig.backendAuthUrl}/lti/login`,
      jwksUri: ltiKeySetUrl(connection.id),
      ltiToolConfig: { domain: new URL(appConfig.backendUrl).host },
    });
  });

  // Contract: LTI Dynamic Registration 1.0 admits each of these registrations (sections 2.2.1 and 2.2.3). Each is
  // accepted, and the registration answer says what the platform recorded, each member where the request had it.
  it('takes a registration without a resource link message, with more types, and with addresses off its domain', async () => {
    const admin = await orgWithUser();
    const request = ltiRegistrationRequest(generateId(), appConfig.slug);
    const config = request[ltiToolConfigurationMember];
    const registered = async (body: object) => {
      const response = await register((await startRegistration(admin)).token, body);
      expect(response.status).toBe(201);
      return (await response.json()) as Record<string, unknown> & { [ltiToolConfigurationMember]: { messages: unknown[]; deployment_id: string } };
    };

    // Support for the resource link launch is implicit: a deep linking message alone, or none.
    const deepLinkingOnly = await registered({
      ...request,
      [ltiToolConfigurationMember]: { ...config, messages: [{ type: 'LtiDeepLinkingRequest' }] },
    });
    expect(deepLinkingOnly[ltiToolConfigurationMember].messages).toEqual([]);
    const { messages: _messages, ...withoutMessages } = config;
    expect((await registered({ ...request, [ltiToolConfigurationMember]: withoutMessages }))[ltiToolConfigurationMember].messages).toEqual([]);

    // Response and grant types hold what the platform needs beside others; it answers the ones it records.
    const moreTypes = await registered({
      ...request,
      response_types: ['code', 'id_token'],
      grant_types: ['authorization_code', 'implicit', 'client_credentials'],
    });
    expect(moreTypes).toMatchObject({ response_types: ['id_token'], grant_types: ['implicit', 'client_credentials'] });

    // The domain is a label: the admin sees every origin a launch goes to and the key set's, and the pages it names.
    const offDomain = await registered({
      ...request,
      initiate_login_uri: 'https://login.example.org/lti',
      jwks_uri: 'https://keys.example.net/jwks',
      client_uri: 'https://peer-review.example.com',
      tos_uri: 'https://peer-review.example.com/terms',
      // Attack: a script address in a link of the approval dialog. Only an HTTPS page is kept.
      policy_uri: 'javascript:alert(1)',
    });
    const listed = await call(listLtiInstallations, { path: admin.path, headers: admin.headers });
    const installation = (listed.data as { results: Record<string, unknown>[] }).results.find(
      ({ id }) => id === offDomain[ltiToolConfigurationMember].deployment_id,
    );
    expect(installation).toMatchObject({
      launchOrigins: expect.arrayContaining(['https://login.example.org']),
      keySetOrigin: 'https://keys.example.net',
      clientUri: 'https://peer-review.example.com',
      tosUri: 'https://peer-review.example.com/terms',
      policyUri: null,
    });
    expect(offDomain).toMatchObject({ client_uri: 'https://peer-review.example.com', tos_uri: 'https://peer-review.example.com/terms' });
    expect(offDomain).not.toHaveProperty('policy_uri');
    expect(offDomain[ltiToolConfigurationMember]).not.toHaveProperty('client_uri');
  });

  it('refuses a registration token used before', async () => {
    const admin = await orgWithUser();
    const { token } = await startRegistration(admin);
    expect((await register(token)).status).toBe(201);

    const reused = await register(token);
    expect(reused.status).toBe(401);
    expect(await reused.json()).toEqual({ error: 'invalid_token' });
    expect(await db.select().from(oauthClientsTable)).toHaveLength(1);
  });

  it('refuses an expired registration token', async () => {
    const admin = await orgWithUser();
    const { token } = await startRegistration(admin);
    await db
      .update(tokensTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(tokensTable.kind, 'lti-tool-registration'));

    expect((await register(token)).status).toBe(401);
    expect(await db.select().from(oauthClientsTable)).toHaveLength(0);
  });

  // The token names its tenant: no input of the request can place the registration elsewhere.
  it("keeps a registration in the tenant whose admin started it, out of another tenant's reach", async () => {
    const admin = await orgWithUser();
    const other = await orgWithUser();
    const { installationId } = await pendingInstallation(admin);

    const [account] = await db.select().from(serviceAccountsTable).where(eq(serviceAccountsTable.id, installationId));
    expect(account.tenantId).toBe(admin.org.tenantId);
    const listed = await call(listLtiInstallations, { path: other.path, headers: other.headers });
    expect(listed.data).toMatchObject({ results: [], totalSize: 0 });
    const approve = await call(approveLtiInstallation, {
      path: installationPath(other, installationId),
      body: { releasedFields: [] },
      headers: other.headers,
    });
    await expectRefusal(approve, 404, 'not_found');
  });

  it('refuses a member starting, approving or rejecting', async () => {
    const admin = await orgWithUser();
    const { installationId } = await pendingInstallation(admin);
    const member = await createFactorOrgUser(call, admin.org.tenantId, admin.org.id, `lti-${nanoid(8)}`, memberRole);
    const asMember = { ...admin, headers: { ...defaultHeaders, Cookie: member.sessionCookie } };

    await expectRefusal((await startRegistration(asMember)).answer, 403, 'forbidden', 'start');
    const path = installationPath(asMember, installationId);
    await expectRefusal(
      await call(approveLtiInstallation, { path, body: { releasedFields: [] }, headers: asMember.headers }),
      403,
      'forbidden',
      'approve',
    );
    await expectRefusal(await call(deleteLtiInstallation, { path, headers: asMember.headers }), 403, 'forbidden', 'delete');
  });

  it('refuses an approval that releases a field the LTI tool did not ask for', async () => {
    const admin = await orgWithUser();
    const { installationId } = await pendingInstallation(admin);
    const path = installationPath(admin, installationId);

    // The app asks for name claims, an email only when its config opts in, never a picture.
    const widened = await call(approveLtiInstallation, { path, body: { releasedFields: ['name', 'picture'] }, headers: admin.headers });
    await expectRefusal(widened, 400, 'lti_field_not_requested');

    const approved = await call(approveLtiInstallation, { path, body: { releasedFields: ['name'] }, headers: admin.headers });
    expect(approved.data).toMatchObject({ status: 'active', requestedFields: ['name'], releasedFields: ['name'] });
  });

  // An installation acts only once approved, and only through its registration: never switched on as an account, never by a key.
  it('refuses enabling a pending installation as a service account, and an API key for an approved one', async () => {
    const admin = await orgWithUser();
    const { installationId } = await pendingInstallation(admin);
    const accountPath = { ...admin.path, serviceAccountId: installationId };

    const enabled = await call(updateServiceAccount, { path: accountPath, body: { status: 'active' }, headers: admin.headers });
    await expectRefusal(enabled, 409, 'service_account_pending');

    await call(approveLtiInstallation, { path: installationPath(admin, installationId), body: { releasedFields: [] }, headers: admin.headers });
    const key = await call(createApiKey, { path: accountPath, body: { name: 'key', scopes: 'all' }, headers: admin.headers });
    await expectRefusal(key, 409, 'installation_takes_no_api_key');
  });

  // Without a secret, a registration the provider read would pass as a public client with a code flow.
  it("refuses an LTI registration at the provider's authorization endpoint and as a grant, approved or not", async () => {
    const admin = await orgWithUser();
    const { clientId, installationId } = await pendingInstallation(admin);
    await call(approveLtiInstallation, { path: installationPath(admin, installationId), body: { releasedFields: [] }, headers: admin.headers });

    const authorization = await startAuthorization(oauth.issuer, {
      clientId,
      redirectUri: `${appConfig.backendAuthUrl}/lti/launch`,
      scope: 'organization:read',
      sessionCookie: admin.user.sessionCookie,
    });
    expect({ status: authorization.status, uid: authorization.uid }).toEqual({ status: 400, uid: null });
    expect(await grantRefusal({ userId: admin.user.id, clientId, tenantId: admin.org.tenantId })).toBe('app_not_installed');
  });
});
