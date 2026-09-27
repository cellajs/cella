import { getOrganizations } from 'sdk';
import { hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders, memberRole } from '../fixtures';
import {
  createSystemAdminUser,
  createTestOrganization,
  createTestSession,
  expectRefusal,
  getUserByEmail,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

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
  let viewer: { id: string; email: string; sessionCookie: string };

  const listAs = (as: { sessionCookie: string }, relatableUserId: string) =>
    call(getOrganizations, {
      query: { relatableUserId, include: 'members,counts' },
      headers: { ...defaultHeaders, Cookie: as.sessionCookie },
    });

  beforeAll(async () => {
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

  /** A membership of `userId` in `org`, with its own role, menu order and archive state. */
  const createOrgMembership = async (
    userId: string,
    org: { id: string; tenantId: string },
    role: typeof memberRole,
    displayOrder: number,
    archived = false,
  ) =>
    db.insert(membershipsTable).values({
      id: generateId(),
      userId,
      channelId: org.id,
      organizationId: org.id,
      tenantId: org.tenantId,
      channelType: 'organization',
      role,
      displayOrder,
      archived,
      createdBy: userId,
    });

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

  it('must not pass a malformed relatableUserId to the database', async () => {
    const { baseApp } = await import('#/routes');
    // Raw requests: the SDK validates the query itself and would throw before the server is reached.
    const listRaw = (as: { sessionCookie: string }, relatableUserId: string) =>
      baseApp.request(`/organizations?${new URLSearchParams({ relatableUserId })}`, {
        headers: { ...defaultHeaders, Cookie: as.sessionCookie },
      });

    // Another user named by anything but a user id relates to nobody: the guard refuses before any query.
    const junk = await listRaw(viewer, 'not-a-user-id');
    await expectRefusal(junk, 403, 'forbidden');

    // Callers the guard lets through, the user by their own slug and a system admin, meet the query schema.
    const [viewerRow] = await getUserByEmail(viewer.email);
    const ownSlug = await listRaw(viewer, viewerRow.slug);
    const sysAdmin = await createSystemAdminUser('relatable-malformed-sysadmin@security-test.com');
    const asAdmin = await listRaw({ sessionCookie: await createTestSession(sysAdmin) }, 'not-a-user-id');
    for (const answer of [ownSlug, asAdmin]) await expectRefusal(answer, 400, 'form.invalid_format');
  });

  it("must not filter another user's list by their archive or role via relatableUserId", async () => {
    // Two more organizations the viewer shares with the target, named against the target's menu order.
    const alpha = await createTestOrganization({ name: 'Alpha shared' });
    const bravo = await createTestOrganization({ name: 'Bravo shared' });
    for (const org of [alpha, bravo]) {
      await createOrgMembership(viewer.id, org, memberRole, 1);
    }
    // The target archived Alpha, holds another role there, and put Bravo first in their menu.
    await createOrgMembership(target.id, alpha, previewedRole, 2, true);
    await createOrgMembership(target.id, bravo, memberRole, 1);
    for (const user of [viewer, target]) invalidateCache.user(user.id);
    const pair = [alpha.id, bravo.id];

    const listFor = (query: Record<string, string>, as: { sessionCookie: string } = viewer) =>
      call(getOrganizations, {
        query: { relatableUserId: target.id, ...query },
        headers: { ...defaultHeaders, Cookie: as.sessionCookie },
      });
    const idsOf = (data: unknown) => (data as OrgList).items.map((org) => org.id).filter((id) => pair.includes(id));

    // The listed user's archive and role are not the viewer's to filter on: refused, never dropped.
    const refused: Record<string, string>[] = [{ excludeArchived: 'true' }, { role: memberRole }];
    for (const query of refused) {
      const { data, error, response } = await listFor(query);
      await expectRefusal({ response, error }, 403, 'forbidden', JSON.stringify(query));
      expect(data).toBeUndefined();
    }

    // The menu-order default names the viewer's own menu; another user's list comes in name order.
    const byMenu = await listFor({ sort: 'displayOrder', order: 'asc' });
    expect(byMenu.response.status).toBe(200);
    expect(idsOf(byMenu.data)).toEqual(pair);

    // The user's own list does follow their archive, role and menu order (positive control).
    expect(idsOf((await listFor({ excludeArchived: 'true' }, target)).data)).toEqual([bravo.id]);
    expect(idsOf((await listFor({ role: memberRole }, target)).data)).toEqual([bravo.id]);
    expect(idsOf((await listFor({ sort: 'displayOrder', order: 'asc' }, target)).data)).toEqual([bravo.id, alpha.id]);
  });

  it('must not list anything for a user who shares no organization', async () => {
    const stranger = await createOrgUser(call, foreign.tenantId, foreign.id, 'relatable-stranger', memberRole);
    const { error, response } = await listAs(stranger, viewer.id);
    await expectRefusal({ response, error }, 403, 'forbidden');
  });
});
