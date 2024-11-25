import type { config } from 'config';
import type { UnsafeUserModel } from '#/db/schema/users';

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export const transformDatabaseUserWithCount = (
  { hashedPassword, unsubscribeToken, ...user }: MakeOptional<UnsafeUserModel, (typeof config.sensitiveFields)[number]>,
  memberships: number,
) => {
  return {
    ...user,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastStartedAt: user.lastStartedAt?.toISOString() ?? null,
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    modifiedAt: user.modifiedAt?.toISOString() ?? null,
    counts: {
      memberships: memberships,
    },
  };
};
