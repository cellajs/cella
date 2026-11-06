import { getOrganization, listTenants } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '#/env';
import { defaultHeaders, overrideConfig } from '../fixtures';
import { createSystemAdminUser, createTestSession, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const allowlistedIp = '10.0.0.1';
const otherIp = '10.0.0.2';

// The suite allows every address; here only one may use system-admin rights.
overrideConfig(env, { SYSTEM_ADMIN_IP_ALLOWLIST: allowlistedIp });

afterEach(async () => await clearSecurityTestData());

describe('System-admin rights follow the request address', async () => {
  const call = await createAppClient();

  /** A tenant the system admin holds no membership in, and a reader of its organization from a given address. */
  const setup = async () => {
    const foreign = await createTestTenant(call, 'foreign');
    const admin = await createSystemAdminUser('sysadmin@example.com');
    const cookie = await createTestSession(admin);
    const headersFrom = (ip: string) => ({ ...defaultHeaders, 'x-forwarded-for': ip, Cookie: cookie });
    const readForeignOrg = (ip: string) =>
      call(getOrganization, { path: { tenantId: foreign.tenantId, organizationId: foreign.organization.id }, headers: headersFrom(ip) });
    const readTenants = (ip: string) => call(listTenants, { query: {}, headers: headersFrom(ip) });
    return { readForeignOrg, readTenants };
  };

  it('must not grant system-admin scope via a session cached from the allowlisted address', async () => {
    const { readForeignOrg } = await setup();

    // Authenticated from the allowlisted address, which also caches the session.
    const allowlisted = await readForeignOrg(allowlistedIp);
    expect(allowlisted.response.status).toBe(200);

    const elsewhere = await readForeignOrg(otherIp);
    await expectRefusal(elsewhere, 403, 'forbidden');

    const back = await readForeignOrg(allowlistedIp);
    expect(back.response.status).toBe(200);
  });

  it('keeps system-admin scope on the allowlisted address after a first request from elsewhere', async () => {
    const { readForeignOrg } = await setup();

    // Authenticated from another address first, which caches the session there.
    const elsewhere = await readForeignOrg(otherIp);
    await expectRefusal(elsewhere, 403, 'forbidden');

    const allowlisted = await readForeignOrg(allowlistedIp);
    expect(allowlisted.response.status).toBe(200);
  });

  // sysAdminGuard reads the isSystemAdmin userGuard derives from the address: the system routes hold the same line.
  it('must not open a system route to a system admin calling from another address', async () => {
    const { readTenants } = await setup();

    await expectRefusal(await readTenants(otherIp), 403, 'no_sysadmin');
    expect((await readTenants(allowlistedIp)).response.status).toBe(200);
  });
});
