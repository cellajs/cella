import { eq, inArray, or, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '#/core/context';
import { baseDb, getSeedDb } from '#/db/db';
import { tenantContext, tenantRead } from '#/db/tenant-context';
import { stxCollected, stxWithIds } from '#/db/utils/stx-ids';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { filterExistingProductIds } from '#/modules/entities/embedding-queries';
import { defaultHeaders } from './fixtures';
import { cleanupEntityHierarchy, insertAttachmentIn, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, orgMembershipOf, type TestTenant } from './security/helpers';
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
 * A host write also gets back a row the CDC worker collected when no host named it any more, as an undo needs.
 */
describe('filterExistingProductIds', async () => {
  const call = await createAppClient();
  const db = getSeedDb();
  let tenant: TestTenant;
  let other: TestTenant;
  const plans: Awaited<ReturnType<typeof seedAttachmentHome>>[] = [];
  const [live, alsoLive, deleted, deletedByRequest, foreign, othersDraft] = Array.from({ length: 6 }, generateId);
  // Tombstones as the worker writes them: one of this organization, one a rolled-back write names, one of another
  // organization, one of a draft that does not show to the caller, one named past the quota, and one named by a
  // caller who may not create it.
  const [collected, collectedThenRolledBack, collectedElsewhere, collectedDraft, collectedPastQuota, collectedUnreadable] = Array.from(
    { length: 6 },
    generateId,
  );
  let bindings: Awaited<ReturnType<typeof orgMembershipOf>>[];
  const everyId = () => [
    live,
    alsoLive,
    deleted,
    deletedByRequest,
    foreign,
    othersDraft,
    collected,
    collectedThenRolledBack,
    collectedElsewhere,
    collectedDraft,
    collectedPastQuota,
    collectedUnreadable,
  ];

  const seed = async (owner: TestTenant, id: string, createdBy: string = owner.user.id) => {
    const plan = await seedAttachmentHome({ id: owner.organization.id, tenantId: owner.tenantId }, owner.user.id);
    plans.push(plan);
    await insertAttachmentIn(plan, { id, tenantId: owner.tenantId, createdBy });
  };

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'existing-ids');
    other = await createTestTenant(call, 'existing-ids-other');
    for (const id of [live, alsoLive, deleted, deletedByRequest]) await seed(tenant, id);
    await seed(other, foreign);
    // Written by another member of the organization and not shown to this caller.
    await seed(tenant, othersDraft, other.user.id);
    await db.update(attachmentsTable).set({ deletedAt: new Date().toISOString() }).where(eq(attachmentsTable.id, deleted));

    bindings = [await orgMembershipOf(tenant.user.id, tenant.organization.id)];
    for (const id of [collected, collectedThenRolledBack, collectedPastQuota, collectedUnreadable]) await seed(tenant, id);
    await seed(other, collectedElsewhere);
    await seed(tenant, collectedDraft, other.user.id);
    await db
      .update(attachmentsTable)
      .set({ deletedAt: new Date().toISOString(), deletedBy: tenant.user.id, stx: stxCollected(attachmentsTable.stx, generateId()) })
      .where(
        inArray(attachmentsTable.id, [
          collected,
          collectedThenRolledBack,
          collectedElsewhere,
          collectedDraft,
          collectedPastQuota,
          collectedUnreadable,
        ]),
      );
  });

  afterAll(async () => {
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, everyId()));
    await cleanupEntityHierarchy(db, ...plans);
    await clearSecurityTestData();
  });

  /**
   * A stand-in for the guards' context, with the fields a tenant transaction, the request scope, the quota and the
   * permission check read; 0 is no quota, and the caller acts through `memberships`.
   */
  const contextOf = (quota = 0, memberships = bindings) =>
    ({
      var: {
        db: baseDb,
        tenantId: tenant.tenantId,
        organizationId: tenant.organization.id,
        actor: { id: tenant.user.id, bindings: memberships, scopes: null },
        isSystemAdmin: false,
        tenant: { restrictions: { quotas: { attachment: quota } } },
      },
    }) as unknown as ActorContext;

  /** The stored tombstone and writer of each row, read past RLS. */
  const stored = async (ids: string[]) => {
    const rows = await db
      .select({ id: attachmentsTable.id, deletedAt: attachmentsTable.deletedAt, updatedBy: attachmentsTable.updatedBy, stx: attachmentsTable.stx })
      .from(attachmentsTable)
      .where(inArray(attachmentsTable.id, ids));
    return new Map(rows.map((row) => [row.id, row]));
  };

  it('keeps the ids of live rows of the organization that show to the caller, in the order given', async () => {
    const ctx = contextOf();

    // A read brings nothing back: a collected row is left out like any deleted one.
    const kept = await tenantRead(ctx, (readCtx) =>
      filterExistingProductIds(readCtx, { entityType: 'attachment', ids: [alsoLive, foreign, generateId(), othersDraft, deleted, collected, live] }),
    );

    expect(kept).toEqual([alsoLive, live]);
    expect((await stored([collected])).get(collected)?.deletedAt).not.toBeNull();
    expect(await filterExistingProductIds(ctx, { entityType: 'attachment', ids: [] })).toEqual([]);
  });

  it('must not bring back a row a write names when that write rolls back', async () => {
    const failed = tenantContext(contextOf(), async (txCtx) => {
      expect(await filterExistingProductIds(txCtx, { entityType: 'attachment', ids: [collectedThenRolledBack] })).toEqual([collectedThenRolledBack]);
      throw new Error('the host write fails');
    });

    await expect(failed).rejects.toThrow('the host write fails');
    expect((await stored([collectedThenRolledBack])).get(collectedThenRolledBack)?.deletedAt).not.toBeNull();
  });

  it('must not bring back a row past the tenant quota, and brings it back once the quota has room', async () => {
    const named = [live, collectedPastQuota];
    const write = (quota: number) =>
      tenantContext(contextOf(quota), (txCtx) => filterExistingProductIds(txCtx, { entityType: 'attachment', ids: named }));

    // The write goes on without the row.
    expect(await write(1)).toEqual([live]);
    expect((await stored([collectedPastQuota])).get(collectedPastQuota)?.deletedAt).not.toBeNull();

    expect(await write(100)).toEqual(named);
  });

  it("must not bring back a row a person deleted, though the delete request sends the worker's mark", async () => {
    const { baseApp } = await import('#/routes');
    const response = await baseApp.request(`/tenants/${tenant.tenantId}/organizations/${tenant.organization.id}/attachments:batch-delete`, {
      method: 'POST',
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      body: JSON.stringify({ ids: [deletedByRequest], stx: { mutationId: generateId(), sourceId: 'cdc', collected: true } }),
    });
    expect(response.status).toBe(200);

    const kept = await tenantContext(contextOf(), (txCtx) => filterExistingProductIds(txCtx, { entityType: 'attachment', ids: [deletedByRequest] }));

    expect(kept).toEqual([]);
    expect((await stored([deletedByRequest])).get(deletedByRequest)?.deletedAt).not.toBeNull();
  });

  it('must not bring back a row its caller may not create where it lives', async () => {
    const kept = await tenantContext(contextOf(0, []), (txCtx) =>
      filterExistingProductIds(txCtx, { entityType: 'attachment', ids: [collectedUnreadable] }),
    );

    expect(kept).toEqual([]);
    expect((await stored([collectedUnreadable])).get(collectedUnreadable)?.deletedAt).not.toBeNull();
  });

  it('brings back a row the worker collected when a host write names it again, and no other tombstone', async () => {
    const named = [deleted, collectedElsewhere, collectedDraft, collected, live];
    // A write that restamps a tombstone, as the public cascade of a channel does, keeps the worker's mark.
    await db
      .update(attachmentsTable)
      .set({ stx: stxWithIds(attachmentsTable.stx, { mutationId: generateId(), sourceId: 'server' }) })
      .where(eq(attachmentsTable.id, collected));

    const kept = await tenantContext(contextOf(), async (txCtx) => {
      const ids = await filterExistingProductIds(txCtx, { entityType: 'attachment', ids: named });
      // The rest of the host write reads no deleted row.
      const setting = await txCtx.var.db.execute<{ value: string }>(sql`SELECT current_setting('app.include_deleted') AS value`);
      expect(setting.rows[0].value).toBe('false');
      return ids;
    });

    expect(kept).toEqual([collected, live]);
    const rows = await stored(named);
    // Live again, written by the caller, and without the worker's mark.
    expect(rows.get(collected)).toMatchObject({ deletedAt: null, updatedBy: tenant.user.id });
    expect(rows.get(collected)?.stx).toMatchObject({ sourceId: 'server' });
    expect(rows.get(collected)?.stx).not.toHaveProperty('collected');
    // A row a person deleted, one of another organization and a draft that does not show to the caller stay deleted.
    for (const id of [deleted, collectedElsewhere, collectedDraft]) expect(rows.get(id)?.deletedAt).not.toBeNull();
  });
});
