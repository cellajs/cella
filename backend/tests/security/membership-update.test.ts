import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { updateMembership } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createTestOrganization } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

const [adminRole] = hierarchy.getRoles('organization');
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

const personalView = ['archived', 'muted', 'displayOrder'];

/**
 * Archive, mute and order are a member's own view of a channel: nobody sets them for someone else, whatever their
 * role, and a response shows them on the caller's own membership only. A role change is an admin's act on the channel
 * and needs `update` there, also on one's own membership.
 */
describe('Membership updates', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');

  afterEach(async () => await clearSecurityTestData());

  async function orgWithAdminAndMember() {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`, memberRole);
    const membershipOf = async (userId: string) => {
      const [row] = await db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelId, org.id)));
      return row;
    };
    const update = (as: { sessionCookie: string }, membershipId: string, body: Record<string, unknown>) =>
      call(updateMembership, {
        path: { tenantId: org.tenantId, organizationId: org.id, id: membershipId },
        body: body as never,
        headers: { ...defaultHeaders, Cookie: as.sessionCookie },
      });
    /** Raw JSON: the SDK's response parsing would hide a field the schema does not declare. */
    const updateRaw = async (as: { sessionCookie: string }, membershipId: string, body: Record<string, unknown>) => {
      const response = await baseApp.request(`/${org.tenantId}/${org.id}/memberships/${membershipId}`, {
        method: 'PUT',
        headers: { ...defaultHeaders, Cookie: as.sessionCookie },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };
    return { org, admin, member, membershipOf, update, updateRaw };
  }

  it("must not touch another member's membership via an empty update", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(admin.id);

    const { error, response } = await update(member, target.id, {});
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('invalid_request');
    // Nothing is written: the row carries no stamp of the caller.
    expect(await membershipOf(admin.id)).toEqual(target);
  });

  it("refuses an empty update from an admin and on the caller's own membership too", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(member.id);

    expect((await update(admin, target.id, {})).response.status).toBe(400);
    expect((await update(member, target.id, {})).response.status).toBe(400);
    expect(await membershipOf(member.id)).toEqual(target);
  });

  it("must not read another member's archive, mute and order via updateMembership", async () => {
    const { admin, member, membershipOf, updateRaw } = await orgWithAdminAndMember();
    // The member archived and muted the organization and moved it in their menu.
    await db
      .update(membershipsTable)
      .set({ archived: true, muted: true, displayOrder: 42 })
      .where(eq(membershipsTable.id, (await membershipOf(member.id)).id));
    const target = await membershipOf(member.id);

    const { status, body } = await updateRaw(admin, target.id, { role: adminRole });
    expect(status).toBe(200);
    for (const field of personalView) expect(body).not.toHaveProperty(field);
    expect(body).toMatchObject({ id: target.id, userId: member.id, role: adminRole });
    expect((await membershipOf(member.id)).role).toBe(adminRole);
  });

  it("returns the caller's own archive, mute and order (positive control)", async () => {
    const { member, membershipOf, updateRaw } = await orgWithAdminAndMember();
    const own = await membershipOf(member.id);

    const { status, body } = await updateRaw(member, own.id, { muted: true });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: own.id, archived: false, muted: true, displayOrder: own.displayOrder });
  });

  it("must not mute or archive another member's membership via updateMembership", async () => {
    const { admin, member, membershipOf, update } = await orgWithAdminAndMember();
    const target = await membershipOf(admin.id);

    const { error, response } = await update(member, target.id, { muted: true, archived: true });
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('forbidden');
    expect(await membershipOf(admin.id)).toMatchObject({ muted: false, archived: false });
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
