import { and, eq } from 'drizzle-orm';
import { markSeen } from 'sdk';
import { getEntityPolicies, getPolicyPermissions, hierarchy, policyMatrix } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { seenByTable } from '#/modules/seen/seen-by-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { cleanupEntityHierarchy, seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const [adminRole] = hierarchy.getRoles('organization');
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

/**
 * markSeen answers how many of the posted ids it newly recorded as seen, and bumps their view counts. It counts only
 * rows the caller may read, like the reads do, so the answer never confirms that a hidden row exists.
 */
describe('markSeen and rows the caller cannot read', async () => {
  const call = await createAppClient();
  // Attachments and seen_by sit under RLS: arrange and assert as admin, so a runtime_role run sees every row.
  const adminDb = getAdminDb('mark-seen test');
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
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await adminDb.insert(attachmentsTable).values(row as typeof attachmentsTable.$inferInsert);
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

  const viewCounters = (productId: string) =>
    adminDb.select().from(productCountersTable).where(eq(productCountersTable.productId, productId));

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: organization.id,
      makeChannelId: () => generateId(),
    });
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'seen-admin', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'seen-member', memberRole);
    await seedEntityHierarchy(adminDb, plan, {
      tenantId: organization.tenantId,
      createdBy: admin.id,
      slugPrefix: 'mark-seen',
    });
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

  describe('with a member role that reads only its own attachments', () => {
    const memberPolicy = getPolicyPermissions(
      getEntityPolicies('attachment', policyMatrix),
      'organization',
      memberRole,
    );
    const configuredRead = memberPolicy?.read;

    // An app configuration the engine supports: `read: 'own'` hides every other member's attachments.
    beforeEach(() => {
      if (memberPolicy) memberPolicy.read = 'own';
    });
    afterEach(() => {
      if (memberPolicy && configuredRead !== undefined) memberPolicy.read = configuredRead;
    });

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
