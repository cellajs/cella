import { getMembers } from 'sdk';
import { appConfig } from 'shared';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { hasPublishedAt } from '#/db/utils/published-predicate';
import { buildInsertableProduct } from '#/mocks/product-mock-registry';
import { getEntityTable } from '#/tables';
import { defaultHeaders, memberRole } from './fixtures';
import { seedEntityHierarchy } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';

type Counts = { products: Record<string, number>; activity: Record<string, number | null> };
type MemberItem = { id: string; counts?: Counts };

/**
 * Member counts read RLS-guarded product tables, so the route reads them as the request's tenant. Under the RLS-subject
 * runtime role (`pnpm test:core:runtime`) a read without the tenant sees no rows, and every count comes back zero.
 */
describe('member counts (include=counts)', async () => {
  const call = await createAppClient();
  const statType = appConfig.memberStatProductTypes[0];
  const authored = 3;
  let tenant: TestTenant;
  let memberId: string;

  beforeAll(async () => {
    const label = `member-counts-${nanoid(6)}`;
    tenant = await createTestTenant(call, label);
    const member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, `${label}-member`, memberRole);
    memberId = member.id;

    // The member authors rows in the organization, at the channels the product type lives under.
    const adminDb = getAdminDb('test setup');
    const plan = buildTestEntityHierarchyPlan({
      entityType: statType,
      organizationId: tenant.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(adminDb, plan, { tenantId: tenant.tenantId, createdBy: memberId, slugPrefix: label });
    const table = getEntityTable(statType);
    const rows = Array.from({ length: authored }, (_, index) =>
      buildInsertableProduct(
        statType,
        {
          id: generateId(),
          tenantId: tenant.tenantId,
          ...plan.channelIdColumns,
          createdBy: memberId,
          updatedBy: null,
          deletedBy: null,
          deletedAt: null,
          ...(hasPublishedAt(table) && { publishedAt: new Date().toISOString() }),
        },
        `${label}-${index}`,
      ),
    );
    // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
    await adminDb.insert(table).values(rows as (typeof table.$inferInsert)[]);
  });

  afterAll(async () => await clearSecurityTestData());

  it('counts the rows a member authored in the channel', async () => {
    const { data, error } = await call(getMembers, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      query: { entityId: tenant.organization.id, entityType: 'organization', include: 'counts' },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

    expect(error).toBeUndefined();
    const items = (data as { items: MemberItem[] }).items;
    const member = items.find(({ id }) => id === memberId);
    expect(member?.counts?.products[statType]).toBe(authored);
    expect(member?.counts?.activity[statType]).toEqual(expect.any(Number));
    // Rows count for their author only: the admin authored none.
    expect(items.find(({ id }) => id === tenant.user.id)?.counts?.products[statType]).toBe(0);
  });
});
