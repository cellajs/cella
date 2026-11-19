import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createLtiRegistrationLink, listLtiConnections } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { tokensTable } from '#/modules/auth/core/tokens/tokens-db';
import { ltiKeySetUrl } from '#/modules/auth/flows/lti/helpers/registration-request';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { connectionsTable } from '#/modules/connections/connections-db';
import { adminRole, defaultHeaders, memberRole } from './fixtures';
import { createTestOrganization, expectRefusal } from './helpers';
import { createFactorOrgUser } from './security/helpers';
import { createAppClient } from './test-client';
import { clearDatabase, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey', 'lti'] });

afterEach(async () => await clearDatabase());

const issuer = 'https://platform.example.edu';
const configurationUrl = `${issuer}/.well-known/openid-configuration`;

/** A platform's OpenID configuration as the spec requires it; a test overrides members to make it invalid. */
const platformConfiguration = (overrides: Record<string, unknown> = {}) => ({
  issuer,
  authorization_endpoint: `${issuer}/lti/authorize`,
  registration_endpoint: `${issuer}/lti/register`,
  jwks_uri: `${issuer}/lti/jwks`,
  token_endpoint: `${issuer}/lti/token`,
  authorization_server: `${issuer}/lti/token-audience`,
  token_endpoint_auth_methods_supported: ['private_key_jwt'],
  token_endpoint_auth_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid'],
  response_types_supported: ['id_token'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  claims_supported: ['sub', 'iss'],
  'https://purl.imsglobal.org/spec/lti-platform-configuration': {
    product_family_code: 'example-lms',
    version: '1.0',
    messages_supported: [{ type: 'LtiResourceLinkRequest' }],
  },
  ...overrides,
});

/**
 * A platform behind the guarded fetch's transport: it serves its configuration and answers a registration with a client
 * id, after reading the key set the registration names, as Brightspace does.
 */
const fakePlatform = (configuration = platformConfiguration()) => {
  const registrations: { authorization: string | undefined; body: Record<string, unknown>; keySetStatus: number }[] = [];
  const clientId = `client-${nanoid(8)}`;
  const transport: GuardedTransport = async ({ url, method, headers, body }) => {
    if (method === 'GET' && url.href === configurationUrl) return Response.json(configuration);
    if (method === 'POST' && url.href === configuration.registration_endpoint) {
      const request = JSON.parse(body ?? '{}');
      const { baseApp } = await import('#/routes');
      const keySet = await baseApp.request(new URL(request.jwks_uri).pathname);
      registrations.push({ authorization: headers.Authorization, body: request, keySetStatus: keySet.status });
      return Response.json({ client_id: clientId, 'https://purl.imsglobal.org/spec/lti-tool-configuration': { deployment_id: 'deployment-1' } });
    }
    return new Response(null, { status: 404 });
  };
  return { options: { transport, resolve: async () => [{ address: '1.1.1.1', family: 4 }] }, registrations, clientId };
};

describe('LTI registration', async () => {
  const call = await createAppClient();

  async function mintLink(role = adminRole) {
    const org = await createTestOrganization();
    const user = await createFactorOrgUser(call, org.tenantId, org.id, `lti-${nanoid(8)}`, role);
    const answer = await call(createLtiRegistrationLink, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: { ...defaultHeaders, Cookie: user.sessionCookie },
    });
    const created = answer.data as { url: string } | undefined;
    return { org, user, answer, link: created ? (new URL(created.url).searchParams.get('link') ?? '') : '' };
  }

  // The contract the launch builds on: the connection names the platform's issuer and the client id it returned. A
  // platform that reads the key set while it handles the registration, as Brightspace does, finds it.
  it("stores the platform's connection with the client id it returned, written by the admin who created the link", async () => {
    const { org, user, link } = await mintLink();
    const platform = fakePlatform();

    await registerLtiPlatformOp({ link, openid_configuration: configurationUrl, registration_token: 'platform-token' }, platform.options);

    const [connection] = await db.select().from(connectionsTable).where(eq(connectionsTable.tenantId, org.tenantId));
    expect(connection).toMatchObject({
      kind: 'lti',
      issuer,
      clientId: platform.clientId,
      status: 'active',
      createdBy: user.id,
      config: {
        authorizationEndpoint: `${issuer}/lti/authorize`,
        authorizationServer: `${issuer}/lti/token-audience`,
        jwksUri: `${issuer}/lti/jwks`,
        deploymentIds: ['deployment-1'],
      },
    });
    expect(platform.registrations[0]).toMatchObject({
      authorization: 'Bearer platform-token',
      body: { token_endpoint_auth_method: 'private_key_jwt', jwks_uri: ltiKeySetUrl(connection.id) },
      keySetStatus: 200,
    });
  });

  // A refused registration leaves nothing behind: the connection stored before the call goes, and its key set with it.
  // While the platform answers, the admins' list leaves the pending connection out.
  it('deletes the pending connection of a registration the platform refuses, and its key set answers no more', async () => {
    const { org, user, link } = await mintLink();
    const keySets: string[] = [];
    const listed: unknown[] = [];
    const refusing: GuardedTransport = async ({ url, method, body }) => {
      if (method === 'GET' && url.href === configurationUrl) return Response.json(platformConfiguration());
      keySets.push(JSON.parse(body ?? '{}').jwks_uri);
      const path = { tenantId: org.tenantId, organizationId: org.id };
      listed.push((await call(listLtiConnections, { path, headers: { ...defaultHeaders, Cookie: user.sessionCookie } })).data);
      return Response.json({ error: 'invalid_client_metadata' }, { status: 400 });
    };

    await expect(
      registerLtiPlatformOp(
        { link, openid_configuration: configurationUrl },
        { transport: refusing, resolve: async () => [{ address: '1.1.1.1', family: 4 }] },
      ),
    ).rejects.toMatchObject({ type: 'lti_registration_refused' });
    expect(listed).toEqual([{ results: [], totalSize: 0 }]);
    expect(await db.select().from(connectionsTable).where(eq(connectionsTable.tenantId, org.tenantId))).toEqual([]);
    const { baseApp } = await import('#/routes');
    expect((await baseApp.request(new URL(keySets[0]).pathname)).status).toBe(404);
  });

  it('refuses a link used before, on a page any platform may frame', async () => {
    const { link } = await mintLink();
    await registerLtiPlatformOp({ link, openid_configuration: configurationUrl }, fakePlatform().options);

    const { baseApp } = await import('#/routes');
    const response = await baseApp.request(`/auth/lti/register?${new URLSearchParams({ link, openid_configuration: configurationUrl })}`);

    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Security-Policy')).toContain('frame-ancestors https:');
    expect(response.headers.get('X-Frame-Options')).toBeNull();
    expect(await response.text()).toContain('org.imsglobal.lti.close');
  });

  it('refuses an expired link', async () => {
    const { link } = await mintLink();
    await db
      .update(tokensTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(tokensTable.kind, 'lti-registration'));

    await expect(registerLtiPlatformOp({ link, openid_configuration: configurationUrl }, fakePlatform().options)).rejects.toMatchObject({
      type: 'lti-registration_expired',
    });
  });

  // A configuration served from one host could name another platform's issuer, and launches signed by that one would pass.
  it('refuses a configuration whose issuer is not the address it is served from', async () => {
    const { link } = await mintLink();
    const platform = fakePlatform(platformConfiguration({ issuer: 'https://other-platform.example.edu' }));

    await expect(registerLtiPlatformOp({ link, openid_configuration: configurationUrl }, platform.options)).rejects.toMatchObject({
      type: 'lti_configuration_invalid',
    });
    expect(platform.registrations).toHaveLength(0);
  });

  it('refuses a platform that does not offer private_key_jwt', async () => {
    const { link } = await mintLink();
    const platform = fakePlatform(platformConfiguration({ token_endpoint_auth_methods_supported: ['client_secret_basic'] }));

    await expect(registerLtiPlatformOp({ link, openid_configuration: configurationUrl }, platform.options)).rejects.toMatchObject({
      type: 'lti_platform_unsupported',
    });
    expect(platform.registrations).toHaveLength(0);
  });

  // Attack: a tenant that adds connections without end holds every slot of the member import. Past its quota, a link is
  // refused, and so is a registration through a link minted before, which creates nothing and asks nothing of the
  // platform. That refusal leaves the link usable once the tenant has room again.
  it("refuses a registration link and a registration past the tenant's quota of LTI connections, keeping the link", async () => {
    const { org, user, link } = await mintLink();
    const quota = appConfig.defaultRestrictions.quotas.ltiConnection ?? 0;
    const config = {
      authorizationEndpoint: `${issuer}/a`,
      tokenEndpoint: `${issuer}/t`,
      jwksUri: `${issuer}/k`,
      productFamilyCode: 'x',
      version: '1',
      deploymentIds: [],
    };
    await db.insert(connectionsTable).values(
      Array.from({ length: quota }, (_, index) => ({
        tenantId: org.tenantId,
        kind: 'lti' as const,
        issuer: `https://held-${index}.example.edu`,
        clientId: `held-${index}`,
        name: `held-${index}`,
        status: 'active' as const,
        config,
      })),
    );

    const platform = fakePlatform();
    await expect(registerLtiPlatformOp({ link, openid_configuration: configurationUrl }, platform.options)).rejects.toMatchObject({
      type: 'lti_connection_limit',
    });
    expect(platform.registrations).toHaveLength(0);
    expect(await db.select().from(connectionsTable).where(eq(connectionsTable.tenantId, org.tenantId))).toHaveLength(quota);
    const path = { tenantId: org.tenantId, organizationId: org.id };
    await expectRefusal(
      await call(createLtiRegistrationLink, { path, headers: { ...defaultHeaders, Cookie: user.sessionCookie } }),
      403,
      'lti_connection_limit',
    );

    await db.delete(connectionsTable).where(eq(connectionsTable.issuer, 'https://held-0.example.edu'));
    await registerLtiPlatformOp({ link, openid_configuration: configurationUrl }, platform.options);
    expect(platform.registrations).toHaveLength(1);
  });

  it('refuses a member creating a registration link', async () => {
    const { answer } = await mintLink(memberRole);
    await expectRefusal(answer, 403, 'forbidden');
  });
});
