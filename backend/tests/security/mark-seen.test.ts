import { and, eq, sql } from 'drizzle-orm';
import { markSeen } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Tx } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { isTrackedProductType } from '#/modules/seen/helpers/tracked-products';
import { seenByTable } from '#/modules/seen/seen-by-db';
import { insertSeenBy } from '#/modules/seen/seen-queries';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { adminDb, createTestOrganization } from '../helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * markSeen answers how many of the posted ids it newly recorded as seen, and bumps their view counts. It counts only
 * rows the caller may read, like the reads do, so the answer never confirms that a hidden row exists.
 */
describe.skipIf(!isTrackedProductType('attachment'))('markSeen and rows the caller cannot read', async () => {
  assumeMemberAttachmentPolicy({ read: 1, update: 'own', delete: 'own' });
  const call = await createAppClient();
  let organization: { id: string; tenantId: string };
  let plan: TestEntityHierarchyPlan;
  let admin: { id: string; sessionCookie: string };
  let member: { id: string; sessionCookie: string };

  const insertAttachment = async (createdBy: string, overrides: Record<string, unknown> = {}) => {
    const id = generateId();
    const row = buildInsertableProduct(
      'attachment',
      {
        id,
        tenantId: organization.tenantId,
        ...plan.channelIdColumns,
        createdBy,
        updatedBy: null,
        deletedBy: null,
        createdAt: new Date().toISOString(),
        ...overrides,
      },
      id,
    );
    await insertAttachmentRow(row);
    return id;
  };

  const markAs = async (as: { sessionCookie: string }, entityIds: string[]) => {
    const { data, response } = await call(markSeen, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: { entityIds, entityType: 'attachment' },
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });
    expect(response.status).toBe(200);
    return (data as { newCount: number }).newCount;
  };

  const seenRows = (userId: string, productId: string) =>
    adminDb
      .select({ id: seenByTable.id })
      .from(seenByTable)
      .where(and(eq(seenByTable.userId, userId), eq(seenByTable.productId, productId)));

  const viewCounters = (productId: string) => adminDb.select().from(productCountersTable).where(eq(productCountersTable.productId, productId));

  beforeAll(async () => {
    organization = await createTestOrganization();
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'seen-admin', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'seen-member', memberRole);
    plan = await seedAttachmentHome(organization, admin.id);
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.tenantId, organization.tenantId));
    await cleanupEntityHierarchy(adminDb, plan);
    await clearSecurityTestData();
  });

  it('must not confirm a deleted attachment via markSeen', async () => {
    const deleted = await insertAttachment(admin.id, { deletedAt: new Date().toISOString(), deletedBy: admin.id });
    const live = await insertAttachment(admin.id);

    expect(await markAs(member, [deleted])).toBe(0);
    expect(await seenRows(member.id, deleted)).toHaveLength(0);
    expect(await viewCounters(deleted)).toHaveLength(0);

    // Positive control: the live row next to it is recorded.
    expect(await markAs(member, [live])).toBe(1);
    expect(await seenRows(member.id, live)).toHaveLength(1);
  });

  it('counts a view once when two marks of one user overlap', async () => {
    const productType = 'attachment';
    // Only narrows the type: the suite is skipped where attachments are not tracked.
    if (!isTrackedProductType(productType)) return;
    const productId = await insertAttachment(admin.id);
    const mark = (tx: Tx) => insertSeenBy({ var: { db: tx } }, { userId: member.id, productType, productIds: [productId] });

    // The first mark stays uncommitted until the second one waits on it, as two tabs that flush at once do.
    const firstMarked = Promise.withResolvers<void>();
    const secondWaiting = Promise.withResolvers<void>();
    const secondPid = Promise.withResolvers<number>();
    const first = adminDb.transaction(async (tx) => {
      const newCount = await mark(tx);
      firstMarked.resolve();
      await secondWaiting.promise;
      return newCount;
    });
    await firstMarked.promise;
    const second = adminDb.transaction(async (tx) => {
      const { rows: backend } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      secondPid.resolve(backend[0].pid);
      return mark(tx);
    });

    const pid = await secondPid.promise;
    for (;;) {
      const { rows: activity } = await adminDb.execute<{ waiting: boolean }>(
        sql`SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${pid}`,
      );
      if (activity[0]?.waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    secondWaiting.resolve();

    expect(await Promise.all([first, second])).toEqual([1, 0]);
    expect(await seenRows(member.id, productId)).toHaveLength(1);
    expect(await viewCounters(productId)).toMatchObject([{ viewCount: 1 }]);
  });

  describe('with a member role that reads only its own attachments', () => {
    // An app configuration the engine supports: `read: 'own'` hides every other member's attachments.
    assumeMemberAttachmentPolicy({ read: 'own' });

    it("must not confirm another member's hidden attachment via markSeen", async () => {
      const hidden = await insertAttachment(admin.id);

      expect(await markAs(member, [hidden])).toBe(0);
      expect(await seenRows(member.id, hidden)).toHaveLength(0);
      expect(await viewCounters(hidden)).toHaveLength(0);
    });

    it('records the attachments the caller can read (positive control)', async () => {
      const own = await insertAttachment(member.id);
      const othersForAdmin = await insertAttachment(member.id);

      expect(await markAs(member, [own])).toBe(1);
      expect(await seenRows(member.id, own)).toHaveLength(1);
      // The admin role still reads every attachment.
      expect(await markAs(admin, [othersForAdmin])).toBe(1);
      expect(await viewCounters(othersForAdmin)).toHaveLength(1);
    });
  });
});
