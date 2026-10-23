import { inArray } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteStoredObjects } from '#/lib/object-storage';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { purgeDeletedAttachmentFiles } from '#/modules/attachment/operations/purge-files';
import { adminDb as db } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

/**
 * The purge deletes stored files, which no version of the app can recover after the bucket's own expiry. It may take
 * only what a deleted row alone names in its organization's storage, and it must see deleted rows under RLS.
 */
describe('Attachment file purge', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let plan: TestEntityHierarchyPlan;
  const ids = { purged: generateId(), sharing: generateId(), live: generateId(), seeded: generateId(), recent: generateId() };
  const keyOf = (name: string) => `${tenant.organization.id}/${tenant.user.id}/${name}`;

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'attachment-purge');
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    const row = (id: string, keys: Record<string, string>, deletedAt: string | null) =>
      insertAttachmentRow(
        buildInsertableProduct(
          'attachment',
          {
            id,
            tenantId: tenant.tenantId,
            ...plan.channelIdColumns,
            bucketName: appConfig.s3.privateBucket,
            keys,
            deletedAt,
            createdBy: tenant.user.id,
            updatedBy: null,
            deletedBy: deletedAt ? tenant.user.id : null,
          },
          id,
        ),
      );
    await row(ids.purged, { original: keyOf('gone.pdf'), preview: keyOf('gone.png') }, hoursAgo(48));
    await row(ids.sharing, { original: keyOf('shared.pdf') }, hoursAgo(48));
    await row(ids.live, { original: keyOf('shared.pdf') }, null);
    await row(ids.seeded, { original: 'seed/v1/notes/original.txt' }, hoursAgo(48));
    await row(ids.recent, { original: keyOf('recent.pdf') }, hoursAgo(1));
  });

  afterAll(async () => {
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, Object.values(ids)));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it("deletes only a deleted attachment's own files past the grace, never a key a live row or a seed shares", async () => {
    await purgeDeletedAttachmentFiles();

    const deleted = vi.mocked(deleteStoredObjects).mock.calls.flatMap(([, keys]) => keys);
    expect(deleted).toEqual(expect.arrayContaining([keyOf('gone.pdf'), keyOf('gone.png')]));
    expect(deleted).not.toContain(keyOf('shared.pdf'));
    expect(deleted).not.toContain('seed/v1/notes/original.txt');
    expect(deleted).not.toContain(keyOf('recent.pdf'));

    const rows = await db
      .select({ id: attachmentsTable.id, purgedAt: attachmentsTable.purgedAt })
      .from(attachmentsTable)
      .where(inArray(attachmentsTable.id, Object.values(ids)));
    const purged = rows.filter((row) => row.purgedAt).map((row) => row.id);
    expect(purged.sort()).toEqual([ids.purged, ids.sharing, ids.seeded].sort());
  });
});
