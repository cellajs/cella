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

/**
 * Archive, mute and order are a member's own view of a channel: nobody sets them for someone else, whatever their
 * role. A role change is an admin's act on the channel and needs `update` there, also on one's own membership.
 */
describe('Membership updates', async () => {
  const call = await createAppClient();

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
    return { org, admin, member, membershipOf, update };
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
