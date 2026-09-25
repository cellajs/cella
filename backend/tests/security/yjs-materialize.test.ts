import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { env } from '#/env';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import type { ErrorResponse } from '../helpers';
import { cleanupEntityHierarchy, seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const paragraph = (text: string) =>
  JSON.stringify([
    { id: generateId(), type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] },
  ]);

/**
 * The relay's materialize route writes a collaborative description on behalf of the last editor. Its body names the
 * entity's tenant and organization: the backend takes the scope from the entity row and refuses a body naming another.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs materialize scope', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  // Attachments sit under RLS: arrange and assert on the admin connection so a runtime_role run sees the row.
  const adminDb = getAdminDb('yjs-materialize test');
  const attachmentId = generateId();
  const original = paragraph('original');
  let owner: TestTenant;
  let other: TestTenant;
  let plan: TestEntityHierarchyPlan;

  const materialize = async (body: Record<string, unknown>, secret: string | null = env.YJS_SECRET) => {
    const response = await baseApp.fetch(
      new Request('http://localhost/yjs/materialize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-yjs-secret': secret }) },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, error: (await response.json()) as ErrorResponse };
  };

  const bodyFor = (scope: { tenantId: string; organizationId: string | null }, text: string) => ({
    entityType: 'attachment',
    entityId: attachmentId,
    ...scope,
    editedBy: owner.user.id,
    description: paragraph(text),
  });

  const ownScope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });

  const storedDescription = async () => {
    const [row] = await adminDb
      .select({ description: attachmentsTable.description })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, attachmentId));
    return row?.description ?? null;
  };

  beforeAll(async () => {
    mockFetchRequest();
    owner = await createTestTenant(call, 'materialize-owner');
    other = await createTestTenant(call, 'materialize-other');
    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: owner.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(adminDb, plan, {
      tenantId: owner.tenantId,
      createdBy: owner.user.id,
      slugPrefix: 'materialize-scope',
    });
    const row = buildInsertableProduct(
      'attachment',
      {
        id: attachmentId,
        tenantId: owner.tenantId,
        ...plan.channelIdColumns,
        description: original,
        createdBy: owner.user.id,
        updatedBy: null,
        deletedBy: null,
      },
      attachmentId,
    );
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await adminDb.insert(attachmentsTable).values(row as typeof attachmentsTable.$inferInsert);
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.id, attachmentId));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  it('must not write without the relay secret or with a wrong one', async () => {
    expect((await materialize(bodyFor(ownScope(), 'no secret'), null)).status).toBe(401);
    expect((await materialize(bodyFor(ownScope(), 'wrong secret'), `${env.YJS_SECRET}x`)).status).toBe(401);
    expect(await storedDescription()).toBe(original);
  });

  it("must not write through a body that names another tenant's organization", async () => {
    for (const organizationId of [other.organization.id, null]) {
      const { status, error } = await materialize(
        bodyFor({ tenantId: owner.tenantId, organizationId }, 'forged organization'),
      );
      expect(status, String(organizationId)).toBe(403);
      expect(error.type).toBe('forbidden');
    }
    expect(await storedDescription()).toBe(original);
  });

  it('must not write through a body that names another tenant', async () => {
    const { status, error } = await materialize(
      bodyFor({ tenantId: other.tenantId, organizationId: owner.organization.id }, 'forged tenant'),
    );
    expect(status).toBe(404);
    expect(error.type).toBe('not_found');
    expect(await storedDescription()).toBe(original);
  });

  it("writes in the row's own scope (positive control)", async () => {
    const { status } = await materialize(bodyFor(ownScope(), 'written by the relay'));
    expect(status).toBe(200);
    expect(await storedDescription()).toContain('written by the relay');
  });
});
