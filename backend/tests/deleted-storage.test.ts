import { eq, inArray, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteStoredObjects, deleteStoredPrefix } from '#/lib/object-storage';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { clearDeletedStorage } from '#/modules/entities/operations/clear-deleted-storage';
import { organizationsTable } from '#/modules/organization/organization-db';
import { yjsDocumentsTable } from '#/modules/yjs/yjs-db';
import { adminDb as db } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const deletedKeys = () => vi.mocked(deleteStoredObjects).mock.calls.flatMap(([, keys]) => keys);
const deletedPrefixes = () => vi.mocked(deleteStoredPrefix).mock.calls.map(([bucket, prefix]) => `${bucket}:${prefix}`);

/**
 * The cleanup job deletes stored files, which nothing recovers after the buckets' own expiry. It must reach the files of
 * a row however the row left (a purge, a hand-written delete, an organization's cascade) and take only what that row
 * alone named under its organization's prefix.
 */
describe('Deleted storage', async () => {
  const call = await createAppClient();
  const plans: TestEntityHierarchyPlan[] = [];

  const seed = async (label: string) => {
    const tenant = await createTestTenant(call, label);
    const plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    plans.push(plan);
    const keyOf = (name: string) => `${tenant.organization.id}/${tenant.user.id}/${name}`;
    const insert = (keys: Record<string, string>, fields: { deletedAt?: string; seq?: number } = {}) => {
      const id = generateId();
      return insertAttachmentRow(
        buildInsertableProduct(
          'attachment',
          {
            id,
            tenantId: tenant.tenantId,
            ...plan.channelIdColumns,
            bucketName: appConfig.s3.privateBucket,
            keys,
            createdBy: tenant.user.id,
            updatedBy: null,
            deletedBy: fields.deletedAt ? tenant.user.id : null,
            ...fields,
          },
          id,
        ),
      ).then(() => id);
    };
    return { tenant, keyOf, insert };
  };

  beforeEach(() => {
    vi.mocked(deleteStoredObjects).mockClear();
    vi.mocked(deleteStoredPrefix).mockClear();
  });

  afterAll(async () => {
    await cleanupEntityHierarchy(db, ...plans);
    await clearSecurityTestData();
  });

  it("deletes a purged or dropped row's files and documents, never a key a live row or a seed names", async () => {
    const { tenant, keyOf, insert } = await seed('deleted-storage');
    // apply_retention() keeps the row holding the organization's newest position, so the counter runs ahead of the rows.
    await db.execute(sql`INSERT INTO channel_counters (channel_key, counts) VALUES (${tenant.organization.id}, '{"sequence": 100}')
      ON CONFLICT (channel_key) DO UPDATE SET counts = channel_counters.counts || '{"sequence": 100}'`);
    const expiredAt = new Date(Date.now() - (appConfig.retention.deletedItemsDays + 1) * 86_400_000).toISOString();
    await insert({ original: keyOf('shared.pdf') });
    await insert({ original: keyOf('gone.pdf'), preview: keyOf('shared.pdf') }, { deletedAt: expiredAt, seq: 5 });
    await insert({ original: 'seed/v1/notes/original.txt' }, { deletedAt: expiredAt, seq: 6 });
    const dropped = await insert({ original: keyOf('dropped.pdf') });
    const scope = { entityType: 'attachment', entityId: dropped, tenantId: tenant.tenantId, organizationId: tenant.organization.id };
    await db.insert(yjsDocumentsTable).values({ ...scope, state: Buffer.from(new Uint8Array()) });

    await db.execute(sql`CALL apply_retention()`);
    await db.delete(attachmentsTable).where(eq(attachmentsTable.id, dropped));
    await clearDeletedStorage();

    expect(deletedKeys()).toEqual(expect.arrayContaining([keyOf('gone.pdf'), keyOf('dropped.pdf')]));
    expect(deletedKeys()).not.toContain(keyOf('shared.pdf'));
    expect(deletedKeys()).not.toContain('seed/v1/notes/original.txt');
    expect(await db.select().from(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, dropped))).toHaveLength(0);
  });

  it("deletes the files of an organization's cascade and everything under its prefix", async () => {
    const { tenant, keyOf, insert } = await seed('deleted-organization');
    const attachment = await insert({ original: keyOf('cascaded.pdf') });

    await db.delete(organizationsTable).where(eq(organizationsTable.id, tenant.organization.id));
    await clearDeletedStorage();

    expect(
      await db
        .select()
        .from(attachmentsTable)
        .where(inArray(attachmentsTable.id, [attachment])),
    ).toHaveLength(0);
    expect(deletedKeys()).toContain(keyOf('cascaded.pdf'));
    for (const bucket of [appConfig.s3.privateBucket, appConfig.s3.publicBucket]) {
      expect(deletedPrefixes()).toContain(`${bucket}:${tenant.organization.id}/`);
    }
  });
});
