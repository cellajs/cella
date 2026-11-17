import { eq, inArray } from 'drizzle-orm';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { createServerStx } from '#/core/stx/create-server-stx';
import { baseDb } from '#/db/db';
import { tenantContext } from '#/db/tenant-context';
import { defineBackendModule } from '#/lib/module';
import type { MutationPayload } from '#/lib/mutation-bus';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { deleteProductsOp, tombstoneProducts } from '#/modules/entities/operations/delete-products';
import { type RowWriter, updateProductsOp } from '#/modules/entities/operations/update-products';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { splitDeleteByPermission } from '#/utils/idempotency';
import { adminDb } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentIn, joinAttachmentHome, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type RenameItem = { id: string; name: string };

const dispatched: { updated: MutationPayload<'attachment.updated'>[]; deleted: MutationPayload<'attachment.deleted'>[] } = {
  updated: [],
  deleted: [],
};

/**
 * Apps run their own row writers and deletes through the parts of `updateProductsOp` and `deleteProductsOp`: a row its
 * writer refuses must cost that row alone, and a narrowed delete must still tombstone and dispatch as the factory does.
 * Run it as `TEST_DB_ROLE=runtime` too: only under RLS does a tombstone need the deleted rows readable.
 */
describe('Product batch parts', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let plan: TestEntityHierarchyPlan;

  // A stand-in for the guards' context, with the fields the operations read.
  const actorContext = async () => {
    const bindings = await baseDb.select().from(membershipsTable).where(eq(membershipsTable.userId, tenant.user.id));
    return {
      var: {
        actor: { kind: 'user', id: tenant.user.id, bindings, scopes: null },
        isSystemAdmin: false,
        db: baseDb,
        tenantId: tenant.tenantId,
        organizationId: tenant.organization.id,
      },
    } as unknown as ActorContext;
  };

  const insert = async (count: number) => {
    const ids = Array.from({ length: count }, () => generateId());
    for (const id of ids) await insertAttachmentIn(plan, { id, tenantId: tenant.tenantId, createdBy: tenant.user.id, name: 'Before' });
    return ids;
  };

  const stored = async (ids: string[]) => {
    const rows = await adminDb.select().from(attachmentsTable).where(inArray(attachmentsTable.id, ids));
    return Object.fromEntries(rows.map((row) => [row.id, { name: row.name, deleted: row.deletedAt !== null }]));
  };

  /** Renames its row, then refuses the rows in `refused` with `status`, as a check after a partial write does. */
  const renameRefusing =
    (refused: string[], status: 403 | 409 = 403): RowWriter<'attachment', RenameItem> =>
    async (txCtx, row, { name }) => {
      const [updated] = await txCtx.var.db.update(attachmentsTable).set({ name }).where(eq(attachmentsTable.id, row.id)).returning();
      if (refused.includes(row.id)) throw new AppError(status, status === 403 ? 'forbidden' : 'write_conflict', 'warn', { entityType: 'attachment' });
      return { updated, changedFields: ['name'] };
    };

  const renameAll = async (ids: string[], writeRow: RowWriter<'attachment', RenameItem>) =>
    updateProductsOp(await actorContext(), { entityType: 'attachment', items: ids.map((id) => ({ id, name: 'After' })), writeRow });

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'product-batch-parts');
    const org = { id: tenant.organization.id, tenantId: tenant.tenantId };
    plan = await seedAttachmentHome(org, tenant.user.id);
    await joinAttachmentHome(org, plan, tenant.user.id);

    defineBackendModule({
      name: 'product-batch-parts-probe',
      owner: 'app',
      scope: ['backend'],
      description: 'Records what the batch parts dispatch',
      onMutation: {
        'attachment.updated': async (_ctx, payload) => void dispatched.updated.push(payload),
        'attachment.deleted': async (_ctx, payload) => void dispatched.deleted.push(payload),
      },
    });
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, tenant.tenantId));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  it('rejects a row its writer refuses, rolls back its write, and writes and dispatches the others', async () => {
    const [first, refused, last] = await insert(3);
    const unknown = generateId();
    dispatched.updated.length = 0;

    const { results, rejectedIds } = await renameAll([first, unknown, refused, last], renameRefusing([refused]));

    expect(rejectedIds).toEqual([unknown, refused]);
    expect(results.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: first, name: 'After' },
      { id: last, name: 'After' },
    ]);
    expect(await stored([first, refused, last])).toMatchObject({
      [first]: { name: 'After' },
      [refused]: { name: 'Before' },
      [last]: { name: 'After' },
    });

    expect(dispatched.updated).toHaveLength(1);
    const [{ before, after, changedFields }] = dispatched.updated;
    expect(before?.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: first, name: 'Before' },
      { id: last, name: 'Before' },
    ]);
    expect(after?.map(({ id }) => id)).toEqual([first, last]);
    expect(changedFields).toEqual([['name'], ['name']]);
  });

  it('answers 403 and writes nothing when the writer refuses every row', async () => {
    const ids = await insert(2);
    dispatched.updated.length = 0;

    await expect(renameAll(ids, renameRefusing(ids))).rejects.toMatchObject({ status: 403, type: 'forbidden' });
    expect(Object.values(await stored(ids)).map(({ name }) => name)).toEqual(['Before', 'Before']);
    expect(dispatched.updated).toHaveLength(0);
  });

  it('fails the whole batch on a refusal that is no 403', async () => {
    const [written, conflicted] = await insert(2);

    await expect(renameAll([written, conflicted], renameRefusing([conflicted], 409))).rejects.toMatchObject({ status: 409 });
    expect((await stored([written]))[written].name).toBe('Before');
  });

  it('hands back what onDelete returned', async () => {
    const ids = await insert(2);

    const answer = await deleteProductsOp(await actorContext(), {
      entityType: 'attachment',
      table: attachmentsTable,
      ids,
      onDelete: async (_txCtx, deleted) => deleted.map(({ id }) => id).sort(),
    });

    expect(answer).toMatchObject({ results: [], rejectedIds: [], onDeleteResult: [...ids].sort() });
  });

  it('tombstones and dispatches the ids an app narrows to inside its own transaction', async () => {
    const [deleted, kept] = await insert(2);
    const ctx = await actorContext();
    const stx = createServerStx();
    dispatched.deleted.length = 0;

    const { allowedIds } = await splitDeleteByPermission(ctx, attachmentsTable, 'attachment', [deleted, kept], stx);
    // Opened without deleted rows: the tombstone must not depend on how its caller opened the transaction.
    const tombstoned = await tenantContext(ctx, (txCtx) =>
      tombstoneProducts(txCtx, { entityType: 'attachment', table: attachmentsTable, ids: allowedIds.filter((id) => id !== kept), stx }),
    );

    expect(tombstoned.map(({ id }) => id)).toEqual([deleted]);
    expect(await stored([deleted, kept])).toMatchObject({ [deleted]: { deleted: true }, [kept]: { deleted: false } });
    expect(dispatched.deleted.map(({ before }) => before?.map(({ id }) => id))).toEqual([[deleted]]);
  });
});
