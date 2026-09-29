import { setTimeout as sleep } from 'node:timers/promises';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deleteMe, deleteMemberships, deleteMyMembership, deleteOrganizations, updateMembership } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db, openDedicatedConnection } from '#/db/db';
import { keepOrganizationAdminConstraint } from '#/db/membership-rules';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

/**
 * An organization always keeps an admin: the only role that can invite, change roles and manage settings. Demoting,
 * removing, leaving and deleting the account of the last admin are refused with 409 `last_admin`, however they are
 * asked for, until someone else is admin. Deleting the organization itself stays possible.
 */
describe('last organization admin', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  async function orgWithOneAdmin() {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`, memberRole);
    const headers = (user: { sessionCookie: string }) => ({ ...defaultHeaders, Cookie: user.sessionCookie });
    const membershipOf = async (userId: string) =>
      (
        await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelId, org.id)))
      )[0];
    return { org, admin, member, headers, membershipOf };
  }

  const expectLastAdmin = (result: { response: Response; error: unknown }) => expectRefusal(result, 409, 'last_admin');

  it('must not leave an organization without an admin via demoting its only admin', async () => {
    const { org, admin, headers, membershipOf } = await orgWithOneAdmin();
    const own = await membershipOf(admin.id);

    await expectLastAdmin(
      await call(updateMembership, {
        path: { tenantId: org.tenantId, organizationId: org.id, id: own.id },
        body: { role: memberRole } as never,
        headers: headers(admin),
      }),
    );
    expect((await membershipOf(admin.id)).role).toBe(adminRole);
  });

  it('must not leave an organization without an admin via removing its only admin', async () => {
    const { org, admin, headers, membershipOf } = await orgWithOneAdmin();

    // This route names members by user id.
    await expectLastAdmin(
      await call(deleteMemberships, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        query: { entityId: org.id, entityType: 'organization' },
        body: { ids: [admin.id] },
        headers: headers(admin),
      }),
    );
    expect(await membershipOf(admin.id)).toBeDefined();
  });

  it('must not leave an organization without an admin via its only admin leaving', async () => {
    const { org, admin, headers, membershipOf } = await orgWithOneAdmin();

    await expectLastAdmin(
      await call(deleteMyMembership, {
        query: { entityId: org.id, entityType: 'organization' },
        headers: headers(admin),
      }),
    );
    expect(await membershipOf(admin.id)).toBeDefined();
  });

  it('must not leave an organization without an admin via deleting the account of its only admin', async () => {
    const { admin, headers } = await orgWithOneAdmin();

    await expectLastAdmin(await call(deleteMe, { headers: headers(admin) }));
    expect(await db.select().from(usersTable).where(eq(usersTable.id, admin.id))).toHaveLength(1);
  });

  it('must not leave an organization without an admin via its two admins removed in concurrent transactions', async () => {
    const { org, admin, membershipOf } = await orgWithOneAdmin();
    const second = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const [first, other] = [await membershipOf(admin.id), await membershipOf(second.id)];
    const unexpected: Error[] = [];
    const t1 = await openDedicatedConnection((err) => unexpected.push(err));
    const t2 = await openDedicatedConnection((err) => unexpected.push(err));
    try {
      await t1.query('BEGIN');
      await t1.query('UPDATE memberships SET role = $1 WHERE id = $2', [memberRole, first.id]);
      // Runs the deferred check now, as the commit would: the other admin still stands.
      await t1.query(`SET CONSTRAINTS ${keepOrganizationAdminConstraint} IMMEDIATE`);

      await t2.query('BEGIN');
      await t2.query('DELETE FROM memberships WHERE id = $1', [other.id]);
      const t2Commit = t2.query('COMMIT').then(
        () => 'committed',
        (err: { code?: string }) => err.code,
      );
      // The second commit checks while the first transaction is still open: it must wait for it, not pass on its own.
      await Promise.race([t2Commit, sleep(200)]);
      await t1.query('COMMIT');

      expect(await t2Commit).toBe('23514');
      expect((await membershipOf(second.id))?.role).toBe(adminRole);
      expect(unexpected).toEqual([]);
    } finally {
      t1.release(true);
      t2.release(true);
    }
  });

  it('lets an admin step down once another admin exists, and deletes the organization (positive controls)', async () => {
    const { org, admin, member, headers, membershipOf } = await orgWithOneAdmin();
    const theirs = await membershipOf(member.id);
    const own = await membershipOf(admin.id);

    const promoted = await call(updateMembership, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: theirs.id },
      body: { role: adminRole } as never,
      headers: headers(admin),
    });
    expect(promoted.response.status).toBe(200);

    const steppedDown = await call(updateMembership, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: own.id },
      body: { role: memberRole } as never,
      headers: headers(admin),
    });
    expect(steppedDown.response.status).toBe(200);

    const deleted = await call(deleteOrganizations, {
      path: { tenantId: org.tenantId },
      body: { ids: [org.id] },
      headers: headers(member),
    });
    expect(deleted.response.status).toBe(200);
    expect(await db.select().from(organizationsTable).where(eq(organizationsTable.id, org.id))).toHaveLength(0);
  });
});
