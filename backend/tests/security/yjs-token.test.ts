/**
 * Yjs token security tests.
 *
 * Verifies that the getYjsToken endpoint correctly enforces:
 * - Permission checking at token-signing time
 * - Context-scoped token payload
 *
 * Per-entity access (cross-tenant / cross-organization isolation) is now decided locally by the
 * relay worker's shared permission engine; see `yjs/src/data/permissions.ts` and its tests.
 */

import { getYjsToken } from 'sdk';
import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs token security', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenantA = await createTestTenant(call, 'yjs-a');
    tenantB = await createTestTenant(call, 'yjs-b');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  // ── Token signing (getYjsToken) ────────────────────────────────

  describe('Token signing', () => {
    it('should return a non-empty token for authenticated user with permission', async () => {
      const { data } = await call(getYjsToken, {
        query: {
          entityType: 'attachment',
          tenantId: tenantA.tenantId,
          organizationId: tenantA.organization.id,
        },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(data).toHaveProperty('token');
      expect((data as { token: string }).token.length).toBeGreaterThan(10);
    });

    it('should return 403 when user has no memberships in tenant', async () => {
      // User A asking for a token in tenant B (no memberships there)
      const { response } = await call(getYjsToken, {
        query: {
          entityType: 'attachment',
          tenantId: tenantB.tenantId,
          organizationId: tenantB.organization.id,
        },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(403);
    });
  });
});
