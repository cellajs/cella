import { eq } from 'drizzle-orm';
import { getOrganizations } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders } from './fixtures';
import { createTestUser } from './helpers';
import { clearSecurityTestData, createSecondOrg, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

type MemberPreview = { id: string; name: string; slug: string; thumbnailUrl: string | null; entityType: 'user' };
type OrgListItem = { id: string; included: { members?: MemberPreview[] } };

describe('Organization member previews (include=members)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let secondOrgId: string;

  // Admin memberships in the first org, oldest first: caller + three more admins
  const extraAdminIds: string[] = [];
  let memberUserId: string;

  const listOrganizations = async (query: Record<string, string> = {}) => {
    const result = await call(getOrganizations, {
      query,
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    const data = result.data as { items: OrgListItem[]; total: number } | undefined;
    return { status: result.response.status, items: data?.items ?? [] };
  };

  const insertMembership = async (
    userId: string,
    orgId: string,
    role: 'admin' | 'member',
    createdAt: string,
    tenantId: string = tenant.tenantId,
  ) => {
    await db.insert(membershipsTable).values({
      id: generateId(),
      userId,
      channelId: orgId,
      organizationId: orgId,
      tenantId,
      channelType: 'organization',
      role,
      displayOrder: 1,
      createdAt,
      createdBy: userId,
    });
  };

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'org-member-previews');

    // Pin the caller's membership createdAt so preview ordering is deterministic
    await db
      .update(membershipsTable)
      .set({ createdAt: daysAgo(10) })
      .where(eq(membershipsTable.userId, tenant.user.id));

    // Three more admins (createdAt descending seniority) + one plain member
    for (const [index, days] of [8, 6, 4].entries()) {
      const admin = await createTestUser(`org-member-previews-admin-${index}@security-test.com`);
      extraAdminIds.push(admin.id);
      await insertMembership(admin.id, tenant.organization.id, 'admin', daysAgo(days));
    }
    const member = await createTestUser('org-member-previews-member@security-test.com');
    memberUserId = member.id;
    await insertMembership(member.id, tenant.organization.id, 'member', daysAgo(2));

    // A second org (its own tenant, per 1:1) has only the caller as admin. The cross-org grouping
    // check. The global org list returns the caller's orgs across tenants, so both still appear.
    const secondOrg = await createSecondOrg();
    secondOrgId = secondOrg.id;
    await insertMembership(tenant.user.id, secondOrg.id, 'admin', daysAgo(9), secondOrg.tenantId);
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  it('M1: returns at most 3 admin previews ordered by membership createdAt', async () => {
    const result = await listOrganizations({ include: 'members' });
    expect(result.status).toBe(200);

    const org = result.items.find((item) => item.id === tenant.organization.id);
    // Caller + first two extra admins (oldest three); 4th admin and the plain member are cut
    expect(org?.included.members?.map((m) => m.id)).toEqual([tenant.user.id, extraAdminIds[0], extraAdminIds[1]]);
    expect(org?.included.members?.some((m) => m.id === memberUserId)).toBe(false);
  });

  it('M2: previews carry only UserMinimalBase fields', async () => {
    const result = await listOrganizations({ include: 'members' });
    const org = result.items.find((item) => item.id === tenant.organization.id);

    for (const preview of org?.included.members ?? []) {
      expect(Object.keys(preview).sort()).toEqual(['entityType', 'id', 'name', 'slug', 'thumbnailUrl']);
      expect(preview.entityType).toBe('user');
    }
  });

  it('M3: previews are grouped per organization', async () => {
    const result = await listOrganizations({ include: 'members' });
    const secondOrg = result.items.find((item) => item.id === secondOrgId);

    // Only the caller is an admin of the second org; no bleed from the first org
    expect(secondOrg?.included.members?.map((m) => m.id)).toEqual([tenant.user.id]);
  });

  it('M4: members is absent without the include flag', async () => {
    const result = await listOrganizations();
    expect(result.status).toBe(200);

    for (const item of result.items) {
      expect(item.included.members).toBeUndefined();
    }
  });
});
