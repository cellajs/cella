import type { config } from 'config';
import { count, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import type { UnsafeUserModel } from '#/db/schema/users';

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export const transformDatabaseUserWithCount = (
  { hashedPassword, unsubscribeToken, ...user }: MakeOptional<UnsafeUserModel, (typeof config.sensitiveFields)[number]>,
  memberships: number,
) => ({
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
