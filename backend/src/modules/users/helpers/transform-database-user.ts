import type { UserModel } from '#/db/schema/users';

// TODO we can simplify this?
export const transformDbUser = (user: UserModel) => ({
  ...user,
  lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  lastStartedAt: user.lastStartedAt?.toISOString() ?? null,
  lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  modifiedAt: user.modifiedAt?.toISOString() ?? null,
});
