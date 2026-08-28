import { eq, inArray } from 'drizzle-orm';
import type { Access } from 'shared';
import { baseDb } from '#/db/db';
import { type MembershipBaseModel, toMembershipBase } from '#/modules/memberships/helpers/select';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';

/** Always the identified variant: these are known users, never the anonymous actor. */
export type UserAccess = Extract<Access<MembershipBaseModel>, { userId: string }>;

/**
 * Build permission `Access` objects for arbitrary users, connected or not.
 *
 * `actorFrom`/`accessFrom` read the request context, so they only ever describe the caller, and
 * stream fan-out only sees users with an open SSE connection. Notifications must decide what an
 * offline user may read, which needs memberships and system-admin status loaded by user id.
 *
 * Both halves are loaded and paired here on purpose: `accessFrom` warns that hand-assembling an
 * Access risks pairing one user's memberships with another's identity, and that warning applies
 * with more force to a loop over many users.
 */
export async function accessForUserIds(userIds: string[]): Promise<Map<string, UserAccess>> {
  const result = new Map<string, UserAccess>();
  if (userIds.length === 0) return result;

  const unique = [...new Set(userIds)];

  const [memberships, systemAdmins] = await Promise.all([
    baseDb.select().from(membershipsTable).where(inArray(membershipsTable.userId, unique)),
    baseDb.select({ userId: systemRolesTable.userId }).from(systemRolesTable).where(eq(systemRolesTable.role, 'admin')),
  ]);

  const adminIds = new Set(systemAdmins.map((row) => row.userId));

  const byUser = new Map<string, MembershipBaseModel[]>();
  for (const membership of memberships) {
    const list = byUser.get(membership.userId) ?? [];
    list.push(toMembershipBase(membership as Record<string, unknown>));
    byUser.set(membership.userId, list);
  }

  for (const userId of unique) {
    result.set(userId, {
      userId,
      isSystemAdmin: adminIds.has(userId),
      memberships: byUser.get(userId) ?? [],
    });
  }

  return result;
}
