/**
 * Yjs token + verify-entity security tests.
 *
 * Verifies that the getYjsToken endpoint correctly enforces:
 * - Permission checking at token-signing time
 * - Context-scoped token payload
 *
 * Verifies that the verifyYjsEntity endpoint correctly enforces:
 * - Shared secret authentication (x-yjs-secret header)
 * - Entity existence check
 * - Cross-tenant isolation
 * - Cross-organization isolation
 */

import { getYjsToken, verifyYjsEntity } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { env } from '#/env';
import { generateMockEntityContextIdColumns } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { defaultHeaders } from '../fixtures';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createSecondOrg, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** Helper: call verifyYjsEntity with the x-yjs-secret header */
async function callVerify(
  call: Awaited<ReturnType<typeof createAppClient>>,
  opts: {
    entityType: string;
    entityId: string;
    tenantId: string;
    userId: string;
    secret?: string;
  },
) {
  return call(verifyYjsEntity, {
    query: {
      entityType: opts.entityType,
      entityId: opts.entityId,
      tenantId: opts.tenantId,
      userId: opts.userId,
    },
    headers: {
      ...defaultHeaders,
      'x-yjs-secret': opts.secret ?? env.YJS_SECRET,
    },
  });
}

/** Helper: insert an attachment directly into the DB (bypasses RLS) */
async function createAttachment(tenantId: string, organizationId: string, createdBy: string) {
  const stamp = Date.now();
  const [attachment] = await db
    .insert(attachmentsTable)
    .values({
      filename: `test-${stamp}.pdf`,
      contentType: 'application/pdf',
      size: '1024',
      originalKey: `test/secret-${stamp}.pdf`,
      bucketName: 'test-bucket',
      // Context ids derived from the hierarchy (e.g. { projectId } in forks); explicit ids below win.
      ...generateMockEntityContextIdColumns('attachment'),
      tenantId,
      organizationId,
      createdBy,
      updatedBy: createdBy,
      stx: { mutationId: `test-att-${stamp}`, sourceId: 'test', fieldTimestamps: {} },
    })
    .returning();

  return { attachment };
}

describe('Yjs token + verify-entity security', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let attachmentA: { id: string };
  let attachmentB: { id: string };

  beforeAll(async () => {
    mockFetchRequest();
    tenantA = await createTestTenant(call, 'yjs-a');
    tenantB = await createTestTenant(call, 'yjs-b');

    attachmentA = (await createAttachment(tenantA.tenantId, tenantA.organization.id, tenantA.user.id)).attachment;
    attachmentB = (await createAttachment(tenantB.tenantId, tenantB.organization.id, tenantB.user.id)).attachment;
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

  // ── Shared secret (verifyYjsEntity) ────────────────────────────

  describe('Shared secret enforcement', () => {
    it('should deny when x-yjs-secret header is missing', async () => {
      const { data } = await call(verifyYjsEntity, {
        query: {
          entityType: 'attachment',
          entityId: attachmentA.id,
          tenantId: tenantA.tenantId,
          userId: tenantA.user.id,
        },
        headers: defaultHeaders,
      });
      expect(data).toMatchObject({ allowed: false });
    });

    it('should deny when x-yjs-secret header is wrong', async () => {
      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: attachmentA.id,
        tenantId: tenantA.tenantId,
        userId: tenantA.user.id,
        secret: 'wrong-secret-value-here',
      });
      expect(data).toMatchObject({ allowed: false });
    });
  });

  // ── Entity existence ──────────────────────────────────────────

  describe('Entity existence', () => {
    it('should deny access to a non-existent entity', async () => {
      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: '00000000-0000-0000-0000-000000000000',
        tenantId: tenantA.tenantId,
        userId: tenantA.user.id,
      });
      expect(data).toMatchObject({ allowed: false });
    });
  });

  // ── Cross-tenant isolation ─────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it('should deny when user has no memberships in the target tenant', async () => {
      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: attachmentB.id,
        tenantId: tenantB.tenantId,
        userId: tenantA.user.id,
      });
      expect(data).toMatchObject({ allowed: false });
    });

    it('should deny when tenantId param does not match entity tenant', async () => {
      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: attachmentA.id,
        tenantId: tenantB.tenantId, // Wrong tenant
        userId: tenantA.user.id,
      });
      expect(data).toMatchObject({ allowed: false });
    });
  });

  // ── Cross-organization isolation ───────────────────────────────

  describe('Cross-organization isolation', () => {
    it('should deny verify for attachment in different org within same tenant', async () => {
      const orgB = await createSecondOrg(tenantA.tenantId);
      const userB = await createOrgUser(call, tenantA.tenantId, orgB.id, 'yjs-orgb');
      const { attachment: orgBAttachment } = await createAttachment(tenantA.tenantId, orgB.id, userB.id);

      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: orgBAttachment.id,
        tenantId: tenantA.tenantId,
        userId: tenantA.user.id,
      });
      expect(data).toMatchObject({ allowed: false });
    });
  });

  // ── Happy path (valid access) ─────────────────────────────────

  describe('Valid access', () => {
    it('should allow org admin to verify attachment in their org', async () => {
      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: attachmentA.id,
        tenantId: tenantA.tenantId,
        userId: tenantA.user.id,
      });
      expect(data).toMatchObject({ allowed: true });
    });

    it('should allow User B to verify their own attachment', async () => {
      const { data } = await callVerify(call, {
        entityType: 'attachment',
        entityId: attachmentB.id,
        tenantId: tenantB.tenantId,
        userId: tenantB.user.id,
      });
      expect(data).toMatchObject({ allowed: true });
    });
  });
});
