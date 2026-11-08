import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { updateMembership } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization, expectRefusal, rawJsonRequest } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser, orgMembershipOf } from './helpers';

const personalView = ['hidden', 'muted', 'displayOrder'];

/**
 * Hide, mute and order are a member's own view of a channel: nobody sets them for someone else, whatever their
 * role, and a response shows them on the caller's own membership only. A role change is an admin's act on the channel
 * and needs `update` there, also on one's own membership.
 */
describe('Membership updates', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  async function orgWithAdminAndMember() {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`, memberRole);
    const membershipOf = (userId: string) => orgMembershipOf(userId, org.id);
    const update = (as: { sessionCookie: string }, membershipId: string, body: Record<string, unknown>) =>
      call(updateMembership, {
        path: { tenantId: org.tenantId, organizationId: org.id, membershipId },
        body: body as never,
        headers: { ...defaultHeaders, Cookie: as.sessionCookie },
      });
    const updateRaw = (as: { sessionCookie: string }, membershipId: string, body: Record<string, unknown>) =>
      rawJsonRequest(`/tenants/${org.tenantId}/organizations/${org.id}/memberships/${membershipId}`, as.sessionCookie, { method: 'PATCH', body });
    return { org, admin, member, membershipOf, update, updateRaw };
  }

  it("must not touch another member's membership via an empty update", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(admin.id);

    const { error, response } = await update(member, target.id, {});
    await expectRefusal({ response, error }, 400, 'invalid_request');
    // Nothing is written: the row carries no stamp of the caller.
    expect(await membershipOf(admin.id)).toEqual(target);
  });

  it("must not touch another member's membership via an update without a body or Content-Type", async () => {
    const { org, admin, member, membershipOf } = await orgWithAdminAndMember();
    const target = await membershipOf(admin.id);
    const { baseApp } = await import('#/routes');
    const { 'Content-Type': _json, ...headers } = defaultHeaders;

    const response = await baseApp.request(`/tenants/${org.tenantId}/organizations/${org.id}/memberships/${target.id}`, {
      method: 'PATCH',
      headers: { ...headers, Cookie: member.sessionCookie },
    });
    await expectRefusal(response, 400, 'invalid_request');
    expect(await membershipOf(admin.id)).toEqual(target);
  });

  it("refuses an empty update from an admin and on the caller's own membership too", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(member.id);

    expect((await update(admin, target.id, {})).response.status).toBe(400);
    expect((await update(member, target.id, {})).response.status).toBe(400);
    expect(await membershipOf(member.id)).toEqual(target);
  });

  it("must not read another member's hide, mute and order via updateMembership", async () => {
    const { admin, member, membershipOf, updateRaw } = await orgWithAdminAndMember();
    // The member hid and muted the organization and moved it in their menu.
    await db
      .update(membershipsTable)
      .set({ hidden: true, muted: true, displayOrder: 42 })
      .where(eq(membershipsTable.id, (await membershipOf(member.id)).id));
    const target = await membershipOf(member.id);

    const { status, body } = await updateRaw(admin, target.id, { role: adminRole });
    expect(status).toBe(200);
    for (const field of personalView) expect(body).not.toHaveProperty(field);
    expect(body).toMatchObject({ id: target.id, userId: member.id, role: adminRole });
    expect((await membershipOf(member.id)).role).toBe(adminRole);
  });

  it("returns the caller's own hide, mute and order (positive control)", async () => {
    const { member, membershipOf, updateRaw } = await orgWithAdminAndMember();
    const own = await membershipOf(member.id);

    const { status, body } = await updateRaw(member, own.id, { muted: true });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: own.id, hidden: false, muted: true, displayOrder: own.displayOrder });
  });

  it("must not mute or hide another member's membership via updateMembership", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(admin.id);

    const { error, response } = await update(member, target.id, { muted: true, hidden: true });
    await expectRefusal({ response, error }, 403, 'forbidden');
    expect(await membershipOf(admin.id)).toMatchObject({ muted: false, hidden: false });
  });

  it("must not set another member's personal view even as an admin", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(member.id);

    const { response } = await update(admin, target.id, { muted: true, displayOrder: 1 });
    expect(response.status).toBe(403);
    expect(await membershipOf(member.id)).toMatchObject({ muted: false, displayOrder: target.displayOrder });
  });

  it('must not self-promote via updateMembership role', async () => {
    const { member, membershipOf, update } = await orgWithAdminAndMember();
    const own = await membershipOf(member.id);

    const { response } = await update(member, own.id, { role: adminRole });
    expect(response.status).toBe(403);
    expect((await membershipOf(member.id)).role).toBe(memberRole);
  });

  it('lets a member mute their own membership and an admin change a role (positive controls)', async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const own = await membershipOf(member.id);

    expect((await update(member, own.id, { muted: true })).response.status).toBe(200);
    expect((await membershipOf(member.id)).muted).toBe(true);

    expect((await update(admin, own.id, { role: adminRole })).response.status).toBe(200);
    expect((await membershipOf(member.id)).role).toBe(adminRole);
  });
});
