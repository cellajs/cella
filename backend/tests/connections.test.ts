import { nanoid } from 'nanoid';
import { type Connection, createConnection, deleteConnection, getConnections, updateConnection } from 'sdk';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { isFederationConfigured } from '#/modules/auth/sso/helpers/federations';
import { defaultHeaders } from './fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession, createTestUser, expectRefusal } from './helpers';
import { createAppClient } from './test-client';
import { clearDatabase, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey', 'sso'] });

// The deployment under test holds no federation client; the registry answers as if it did, except where a test says otherwise.
vi.mock('#/modules/auth/sso/helpers/federations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/modules/auth/sso/helpers/federations')>()),
  isFederationConfigured: vi.fn(() => true),
}));

afterEach(async () => {
  await clearDatabase();
});

/** The institution an admin connects: a SURFconext institution with two IdPs and two domains. */
const institution = {
  issuer: 'surfconext' as const,
  displayName: 'Hogeschool Utrecht',
  claimValues: ['hu.nl', 'student.hu.nl'],
  idpEntityIds: ['https://idp.hu.nl/students', 'https://idp.hu.nl/employees'],
};

describe('connections, managed per tenant by system admins', async () => {
  const call = await createAppClient();

  const adminHeaders = async () => {
    const admin = await createSystemAdminUser(`connections-${nanoid(8)}@test.com`);
    return { ...defaultHeaders, Cookie: await createTestSession(admin) };
  };

  it('connects an institution to a tenant, pending until the institution activates the app, and lists it', async () => {
    const headers = await adminHeaders();
    const organization = await createTestOrganization();

    const { response, data } = await call(createConnection, { path: { tenantId: organization.tenantId }, body: institution, headers });
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      tenantId: organization.tenantId,
      kind: 'sso',
      issuer: 'surfconext',
      status: 'pending',
      jitProvisioning: true,
      claimValues: ['hu.nl', 'student.hu.nl'],
      config: { idpEntityIds: institution.idpEntityIds },
    });

    const listed = await call(getConnections, { path: { tenantId: organization.tenantId }, headers });
    expect(listed.data).toHaveLength(1);
    expect((listed.data as Connection[])[0].id).toBe((data as Connection).id);
  });

  it('refuses a second SSO connection for the same tenant, and a domain another connection accepts', async () => {
    const headers = await adminHeaders();
    const organization = await createTestOrganization();
    expect((await call(createConnection, { path: { tenantId: organization.tenantId }, body: institution, headers })).response.status).toBe(200);

    const again = await call(createConnection, {
      path: { tenantId: organization.tenantId },
      body: { ...institution, claimValues: ['other.nl'] },
      headers,
    });
    await expectRefusal(again, 409, 'resource_already_exists', 'second connection of the tenant');

    const other = await createTestOrganization();
    const taken = await call(createConnection, {
      path: { tenantId: other.tenantId },
      body: { ...institution, claimValues: ['student.hu.nl'] },
      headers,
    });
    await expectRefusal(taken, 409, 'resource_already_exists', 'domain of another tenant');
  });

  // An unknown federation never reaches the API: the OpenAPI schema enumerates the app's federations, so the SDK refuses it first.
  it('refuses a federation this deployment holds no client for', async () => {
    const headers = await adminHeaders();
    const organization = await createTestOrganization();

    vi.mocked(isFederationConfigured).mockReturnValueOnce(false);
    const unconfigured = await call(createConnection, { path: { tenantId: organization.tenantId }, body: institution, headers });
    await expectRefusal(unconfigured, 400, 'sso_not_configured');
  });

  it('updates status, domains and provisioning, keeping domains unique across connections', async () => {
    const headers = await adminHeaders();
    const organization = await createTestOrganization();
    const { data: created } = await call(createConnection, { path: { tenantId: organization.tenantId }, body: institution, headers });
    const other = await createTestOrganization();
    await call(createConnection, { path: { tenantId: other.tenantId }, body: { ...institution, claimValues: ['uu.nl'] }, headers });

    const path = { tenantId: organization.tenantId, id: (created as Connection).id };
    const updated = await call(updateConnection, { path, body: { status: 'active', jitProvisioning: false, claimValues: ['hu.nl'] }, headers });
    expect(updated.response.status).toBe(200);
    expect(updated.data).toMatchObject({
      status: 'active',
      jitProvisioning: false,
      claimValues: ['hu.nl'],
      config: { idpEntityIds: institution.idpEntityIds },
    });

    const collision = await call(updateConnection, { path, body: { claimValues: ['uu.nl'] }, headers });
    await expectRefusal(collision, 409, 'resource_already_exists');
  });

  it('deletes a connection once', async () => {
    const headers = await adminHeaders();
    const organization = await createTestOrganization();
    const { data: created } = await call(createConnection, { path: { tenantId: organization.tenantId }, body: institution, headers });
    const path = { tenantId: organization.tenantId, id: (created as Connection).id };

    expect((await call(deleteConnection, { path, headers })).response.status).toBe(200);
    await expectRefusal(await call(deleteConnection, { path, headers }), 404, 'not_found');
  });

  it('refuses a member who is no system admin, and every route while the sso method is off', async () => {
    const organization = await createTestOrganization();
    const user = await createTestUser(`member-${nanoid(8)}@test.com`);
    const memberHeaders = { ...defaultHeaders, Cookie: await createTestSession(user) };
    expect((await call(getConnections, { path: { tenantId: organization.tenantId }, headers: memberHeaders })).response.status).toBe(403);

    setTestConfig({ enabledAuthStrategies: ['passkey'] });
    onTestFinished(() => setTestConfig({ enabledAuthStrategies: ['passkey', 'sso'] }));
    const headers = await adminHeaders();
    await expectRefusal(await call(getConnections, { path: { tenantId: organization.tenantId }, headers }), 400, 'forbidden_strategy');
  });
});
