/**
 * Cross-organization API isolation tests.
 *
 * Verifies that the org guard middleware prevents users in one
 * organization from accessing resources in another organization
 * within the same tenant.
 *
 * Since RLS enforces tenant-level isolation only, org-level isolation
 * relies entirely on the guard chain (authGuard → tenantGuard → orgGuard).
 * These tests are the primary safety net for cross-org data leaks.
 */

import { createAttachments, deleteAttachments, getAttachments, getOrganization, updateOrganization } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateMockEntityBodyContextIdColumns } from '#/mocks';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createSecondOrg, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const attachmentBody = (id: string) => ({
  id,
  filename: 'cross-org.pdf',
  contentType: 'application/pdf',
  size: '1024',
  originalKey: `test/cross-org-${id}.pdf`,
  bucketName: 'test-bucket',
  // Body-level context ids derived from the hierarchy (empty in cella, e.g. { projectId } in forks).
  ...generateMockEntityBodyContextIdColumns('attachment'),
  stx: { mutationId: id, sourceId: 'cross-org', fieldTimestamps: {} },
});

describe('Cross-organization API isolation', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let orgB: { id: string; slug: string };
  let userB: { id: string; email: string; sessionCookie: string };

  beforeAll(async () => {
    mockFetchRequest();

    // Create tenant with org A and admin user A
    tenant = await createTestTenant(call, 'org-isolation');

    // Create a second org in the same tenant, with its own user
    const secondOrg = await createSecondOrg(tenant.tenantId);
    orgB = { id: secondOrg.id, slug: secondOrg.slug };
    userB = await createOrgUser(call, tenant.tenantId, orgB.id, 'org-b');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  // ---- Read isolation: User A (org A) cannot read org B resources ----

  describe('User A (org A) cannot read org B resources', () => {
    it('should reject GET attachments in another org with 403', async () => {
      const { error, response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: orgB.id },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });

  // ---- Read isolation: User B (org B) cannot read org A resources ----

  describe('User B (org B) cannot read org A resources', () => {
    it('should reject GET attachments in another org with 403', async () => {
      const { error, response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: userB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });

  // ---- Write isolation: cross-org write attempts ----

  describe('Write isolation across organizations', () => {
    it('should reject User B updating org A with 403', async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        body: { name: 'Hijacked by User B' },
        headers: { ...defaultHeaders, Cookie: userB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject User A updating org B with 403', async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenant.tenantId, id: orgB.id },
        body: { name: 'Hijacked by User A' },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject User A creating attachment in org B with 403', async () => {
      const { error, response } = await call(createAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: orgB.id },
        body: [attachmentBody('00000000-0000-4000-a000-000000000001')],
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject User B creating attachment in org A with 403', async () => {
      const { error, response } = await call(createAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: [attachmentBody('00000000-0000-4000-a000-000000000002')],
        headers: { ...defaultHeaders, Cookie: userB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });

  // ---- Positive: users can access their own organization ----

  describe('Users can access their own organization', () => {
    it('should allow User A to GET attachments in org A', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User B to GET attachments in org B', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: orgB.id },
        headers: { ...defaultHeaders, Cookie: userB.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User A to GET their own organization', async () => {
      const { response } = await call(getOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User A to update their own organization', async () => {
      const { response } = await call(updateOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        body: { name: 'Org A Updated' },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User A to soft-delete their own attachment', async () => {
      const id = '00000000-0000-4000-a000-00000000d001';

      const createRes = await call(createAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: [attachmentBody(id)],
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(createRes.response.status).toBe(201);

      const { response } = await call(deleteAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: { ids: [id], stx: { mutationId: `${id}-delete`, sourceId: 'cross-org' } },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });

      expect(response.status).toBe(200);
    });
  });
});
