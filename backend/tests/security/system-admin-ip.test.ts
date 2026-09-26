import { getOrganization } from 'sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '#/env';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestSession, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const allowlistedIp = '10.0.0.1';
const otherIp = '10.0.0.2';
const allowlistBefore = env.SYSTEM_ADMIN_IP_ALLOWLIST;

beforeAll(() => {
  mockFetchRequest();
  // The suite allows every address; here only one may use system-admin rights.
  Object.assign(env, { SYSTEM_ADMIN_IP_ALLOWLIST: allowlistedIp });
});

afterAll(() => {
  Object.assign(env, { SYSTEM_ADMIN_IP_ALLOWLIST: allowlistBefore });
});

afterEach(async () => await clearSecurityTestData());

describe('System-admin rights follow the request address', async () => {
  const call = await createAppClient();

  /** A tenant the system admin holds no membership in, and a reader of its organization from a given address. */
  const setup = async () => {
    const foreign = await createTestTenant(call, 'foreign');
    const admin = await createSystemAdminUser('sysadmin@example.com');
    const cookie = await createTestSession(admin);
    const readForeignOrg = (ip: string) =>
      call(getOrganization, {
        path: { tenantId: foreign.tenantId, id: foreign.organization.id },
        headers: { ...defaultHeaders, 'x-forwarded-for': ip, Cookie: cookie },
      });
    return { readForeignOrg };
  };

  it('must not grant system-admin scope via a session cached from the allowlisted address', async () => {
    const { readForeignOrg } = await setup();

    // Authenticated from the allowlisted address, which also caches the session.
    const allowlisted = await readForeignOrg(allowlistedIp);
    expect(allowlisted.response.status).toBe(200);

    const elsewhere = await readForeignOrg(otherIp);
    expect(elsewhere.response.status).toBe(403);
    expect((elsewhere.error as ErrorResponse).type).toBe('forbidden');

    const back = await readForeignOrg(allowlistedIp);
    expect(back.response.status).toBe(200);
  });

  it('keeps system-admin scope on the allowlisted address after a first request from elsewhere', async () => {
    const { readForeignOrg } = await setup();

    // Authenticated from another address first, which caches the session there.
    const elsewhere = await readForeignOrg(otherIp);
    expect(elsewhere.response.status).toBe(403);
    expect((elsewhere.error as ErrorResponse).type).toBe('forbidden');

    const allowlisted = await readForeignOrg(allowlistedIp);
    expect(allowlisted.response.status).toBe(200);
  });
});
