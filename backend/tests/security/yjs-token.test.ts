import { getYjsToken } from 'sdk';
import { appConfig } from 'shared';
import { verifyYjsToken } from 'shared/utils/yjs-token';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '#/env';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const [entityType] = appConfig.productEntityTypes;
const TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * The relay trusts every claim of a Yjs token without asking the backend, and its tenant scopes the session: a token
 * carries only the caller, the organization the caller is a member of, and that organization's own tenant.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs token security', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  const tokenFor = (as: TestTenant, query: { tenantId: string; organizationId: string }) =>
    call(getYjsToken, {
      query: { entityType, ...query },
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });

  beforeAll(async () => {
    mockFetchRequest();
    tenantA = await createTestTenant(call, 'yjs-a');
    tenantB = await createTestTenant(call, 'yjs-b');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  it("signs the caller, the entity type and the organization's own tenant (positive control)", async () => {
    const before = Date.now();
    const { data, response } = await tokenFor(tenantA, {
      tenantId: tenantA.tenantId,
      organizationId: tenantA.organization.id,
    });
    expect(response.status).toBe(200);

    const verified = verifyYjsToken((data as { token: string }).token, env.YJS_SECRET);
    if (!verified.ok) throw new Error(`token did not verify: ${verified.reason}`);
    const { exp, ...claims } = verified.payload;
    expect(claims).toEqual({
      userId: tenantA.user.id,
      entityType,
      tenantId: tenantA.tenantId,
      organizationId: tenantA.organization.id,
    });
    expect(exp).toBeGreaterThanOrEqual(before + TOKEN_TTL_MS);
    expect(exp).toBeLessThanOrEqual(Date.now() + TOKEN_TTL_MS);
  });

  it('must not sign a token for an organization the caller is not a member of', async () => {
    const { data, error, response } = await tokenFor(tenantA, {
      tenantId: tenantB.tenantId,
      organizationId: tenantB.organization.id,
    });
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('forbidden');
    expect(data).toBeUndefined();
  });

  it('must not sign another tenant into a token via a mismatched tenantId', async () => {
    const { data, error, response } = await tokenFor(tenantA, {
      tenantId: tenantB.tenantId,
      organizationId: tenantA.organization.id,
    });
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('forbidden');
    expect(data).toBeUndefined();
  });
});
