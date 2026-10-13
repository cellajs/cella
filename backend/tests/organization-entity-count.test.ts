import { eq } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '#/core/context';
import { baseDb, getSeedDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { getOrganizationEntityCount } from '#/modules/entities/entities-queries';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// The template's one product keeps no drafts. Here it counts as a product that does, so the count reads its table.
vi.mock('#/db/utils/published-predicate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/db/utils/published-predicate')>()),
  hasPublishedAt: () => true,
}));

/**
 * A product that keeps drafts is counted on its table, drafts included: the counter row follows published rows only.
 * A product table sits under row-level security, so the count is right under the runtime role only when it runs in a
 * tenant transaction, whatever connection the caller hands over.
 */
describe('The count of a product that keeps drafts', async () => {
  const call = await createAppClient();
  const db = getSeedDb();
  let tenant: TestTenant;
  let plan: Awaited<ReturnType<typeof seedAttachmentHome>>;
  const ids = [generateId(), generateId(), generateId()];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'entity-count');
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    for (const id of ids) {
      const columns = { id, tenantId: tenant.tenantId, ...plan.channelIdColumns, createdBy: tenant.user.id, updatedBy: null, deletedBy: null };
      await insertAttachmentRow(buildInsertableProduct('attachment', columns, id));
    }
    await db.update(attachmentsTable).set({ deletedAt: new Date().toISOString() }).where(eq(attachmentsTable.id, ids[2]));
  });

  afterAll(async () => {
    for (const id of ids) await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('counts the live rows of the organization on the bare connection a request context carries', async () => {
    // A stand-in for the guards' context, with the fields a tenant transaction reads.
    const ctx = { var: { db: baseDb, tenantId: tenant.tenantId, actor: { id: tenant.user.id } } } as unknown as ActorContext;

    expect(await getOrganizationEntityCount(ctx, { organizationId: tenant.organization.id, entityType: 'attachment' })).toBe(2);
  });
});
