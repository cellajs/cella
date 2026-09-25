import { getOrganizations } from 'sdk';
import { hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createSystemAdminUser, createTestOrganization, createTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
// Member previews list the organization's top role, so the viewer holds it to appear in one.
const [previewedRole] = hierarchy.getRoles('organization');

type OrgList = {
  items: { id: string; included: { members?: { id: string }[]; counts?: unknown } }[];
  total: number;
};

/**
 * A profile lists the organizations a user is a member of. Viewing another user's profile shows only the organizations
 * the viewer shares with them: the target's membership elsewhere, in another tenant, is not the viewer's to see.
 */
describe('Organizations of another user (relatableUserId)', async () => {
  const call = await createAppClient();
  let shared: { id: string; tenantId: string };
  let foreign: { id: string; tenantId: string };
  let target: { id: string; sessionCookie: string };
  let viewer: { id: string; sessionCookie: string };

  const listAs = (as: { sessionCookie: string }, relatableUserId: string) =>
    call(getOrganizations, {
      query: { relatableUserId, include: 'members,counts' },
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });

  beforeAll(async () => {
    mockFetchRequest();
    shared = await createTestOrganization();
    foreign = await createTestOrganization();
    target = await createOrgUser(call, shared.tenantId, shared.id, 'relatable-target', memberRole);
    viewer = await createOrgUser(call, shared.tenantId, shared.id, 'relatable-viewer', previewedRole);
    // The target is also a member of an organization in another tenant, which the viewer has no part in.
    await db.insert(membershipsTable).values({
      id: generateId(),
      userId: target.id,
      channelId: foreign.id,
      organizationId: foreign.id,
      tenantId: foreign.tenantId,
      channelType: 'organization',
      role: memberRole,
      displayOrder: 2,
      createdBy: target.id,
    });
  });

  afterAll(async () => await clearSecurityTestData());

  it("must not list another tenant's organization via relatableUserId", async () => {
    const { data, response } = await listAs(viewer, target.id);
    expect(response.status).toBe(200);
    const { items, total } = data as OrgList;
    expect(items.map((org) => org.id)).toEqual([shared.id]);
    expect(total).toBe(1);
  });

  it('lists the shared organization with its members and counts, and every one to the user and a system admin', async () => {
    const { data } = await listAs(viewer, target.id);
    const org = (data as OrgList).items.find((item) => item.id === shared.id);
    expect(org?.included.members?.map((member) => member.id)).toContain(viewer.id);
    expect(org?.included.counts).toBeDefined();

    const own = await listAs(target, target.id);
    expect((own.data as OrgList).items.map((o) => o.id).sort()).toEqual([shared.id, foreign.id].sort());

    const sysAdmin = await createSystemAdminUser('relatable-sysadmin@security-test.com');
    const asAdmin = await listAs({ sessionCookie: await createTestSession(sysAdmin) }, target.id);
    expect((asAdmin.data as OrgList).items.map((o) => o.id).sort()).toEqual([shared.id, foreign.id].sort());
  });

  it('must not list anything for a user who shares no organization', async () => {
    const stranger = await createOrgUser(call, foreign.tenantId, foreign.id, 'relatable-stranger', memberRole);
    const { error, response } = await listAs(stranger, viewer.id);
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('forbidden');
  });
});
