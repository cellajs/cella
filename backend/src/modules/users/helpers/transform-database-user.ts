import { count, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import type { UserModel } from '#/db/schema/users';

// TODO we can simplify this?
export const transformDatabaseUserWithCount = (user: UserModel, memberships: number) => ({
  ...user,
  lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  lastStartedAt: user.lastStartedAt?.toISOString() ?? null,
  lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  modifiedAt: user.modifiedAt?.toISOString() ?? null,
  counts: {
    memberships,
  },
});

export const getUserMembershipsCount = async (userId: string) => {
  const [{ memberships }] = await db
    .select({
      memberships: count(),
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));
  return memberships;
};
