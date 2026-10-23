import { eq, inArray, or } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '#/core/context';
import { baseDb, getSeedDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { filterExistingProductIds } from '#/modules/entities/embedding-queries';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// The template's one product keeps no drafts, so its draft rule would never reach the statement. Here the public date
// stands in for the publish date: a row without one shows to its creator alone.
vi.mock('#/db/utils/published-predicate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/db/utils/published-predicate')>()),
  draftVisibleRowsPredicate: (_table: unknown, actorId: string) => or(eq(attachmentsTable.public, true), eq(attachmentsTable.createdBy, actorId)),
}));

/**
 * A host row stores the ids of the rows it embeds (`appConfig.productEmbeddings`). The filter keeps the ids that name a
 * live row of the request's organization, so a host never stores an id of another organization or of a deleted row.
 */
describe('filterExistingProductIds', async () => {
  const call = await createAppClient();
  const db = getSeedDb();
  let tenant: TestTenant;
  let other: TestTenant;
  const plans: Awaited<ReturnType<typeof seedAttachmentHome>>[] = [];
  const [live, alsoLive, deleted, foreign, othersDraft] = [generateId(), generateId(), generateId(), generateId(), generateId()];

  const seed = async (owner: TestTenant, id: string, createdBy: string = owner.user.id) => {
    const plan = await seedAttachmentHome({ id: owner.organization.id, tenantId: owner.tenantId }, owner.user.id);
    plans.push(plan);
    const columns = { id, tenantId: owner.tenantId, ...plan.channelIdColumns, createdBy, updatedBy: null, deletedBy: null };
    await insertAttachmentRow(buildInsertableProduct('attachment', columns, id));
  };

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'existing-ids');
    other = await createTestTenant(call, 'existing-ids-other');
    for (const id of [live, alsoLive, deleted]) await seed(tenant, id);
    await seed(other, foreign);
    // Written by another member of the organization and not shown to this caller.
    await seed(tenant, othersDraft, other.user.id);
    await db.update(attachmentsTable).set({ deletedAt: new Date().toISOString() }).where(eq(attachmentsTable.id, deleted));
  });

  afterAll(async () => {
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, [live, alsoLive, deleted, foreign, othersDraft]));
    await cleanupEntityHierarchy(db, ...plans);
    await clearSecurityTestData();
  });

  it('keeps the ids of live rows of the organization that show to the caller, in the order given', async () => {
    // A stand-in for the guards' context, with the fields a tenant transaction and the request scope read.
    const ctx = {
      var: { db: baseDb, tenantId: tenant.tenantId, organizationId: tenant.organization.id, actor: { id: tenant.user.id } },
    } as unknown as ActorContext;

    const kept = await tenantRead(ctx, (readCtx) =>
      filterExistingProductIds(readCtx, { entityType: 'attachment', ids: [alsoLive, foreign, generateId(), othersDraft, deleted, live] }),
    );

    expect(kept).toEqual([alsoLive, live]);
    expect(await filterExistingProductIds(ctx, { entityType: 'attachment', ids: [] })).toEqual([]);
  });
});
