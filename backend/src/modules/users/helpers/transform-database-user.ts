import type { UserModel } from '../../../db/schema/users';

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export const transformDatabaseUserWithCount = (
  { hashedPassword, unsubscribeToken, ...user }: MakeOptional<UserModel, 'hashedPassword' | 'unsubscribeToken'>,
  memberships: number,
) => {
  return {
    ...user,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastVisitAt: user.lastVisitAt?.toISOString() ?? null,
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    modifiedAt: user.modifiedAt?.toISOString() ?? null,
    counts: {
      memberships: memberships,
    },
  };
};

export const transformDatabaseUser = ({
  hashedPassword,
  unsubscribeToken,
  ...user
}: MakeOptional<UserModel, 'hashedPassword' | 'unsubscribeToken'>) => {
  return {
    ...user,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastVisitAt: user.lastVisitAt?.toISOString() ?? null,
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    modifiedAt: user.modifiedAt?.toISOString() ?? null,
  };
};
