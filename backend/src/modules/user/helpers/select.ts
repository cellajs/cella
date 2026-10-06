import { eq, getColumns, sql } from 'drizzle-orm';
import { appConfig, type UserFlags } from 'shared';
import { actorsTable } from '#/modules/actors/actors-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { pick } from '#/utils/pick';

/** User with the activity times its `actors` row holds. */
export type UserWithActivity = UserModel & { lastSeenAt: string | null; lastSignInAt: string | null };

/**
 * Joins a user's `actors` row, which holds the activity times. Every query that selects {@link userSelect} or
 * {@link memberSelect} needs it: without the join Postgres refuses the query.
 */
export const userActorJoin = eq(actorsTable.id, usersTable.id);

/** Merges userFlags with the defaults; the activity times come from `actors` ({@link userActorJoin}), outside CDC. */
export const userSelect = (() => {
  const { userFlags: _uf, ...safeUserSelect } = getColumns(usersTable);
  return {
    ...safeUserSelect,
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
    lastSeenAt: actorsTable.lastSeenAt,
    lastSignInAt: actorsTable.lastSignInAt,
  };
})();

/** Sort key for "last seen": never-seen users sort as oldest, since a plain DESC puts nulls first in Postgres. */
export const lastSeenOrder = sql`COALESCE(${actorsTable.lastSeenAt}, '-infinity')`;

type TableColumns = (typeof usersTable)['_']['columns'];
type UserBaseKeys = keyof typeof userBaseSchema.shape;
type UserBaseSelect = Pick<TableColumns, UserBaseKeys>;

const userBaseSelect: UserBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = Object.keys(userBaseSchema.shape) as UserBaseKeys[];
  return pick(cols, keys);
})();

/** Limited to userBaseSelect columns plus lastSeenAt, for cross-tenant user endpoints and member lists; needs {@link userActorJoin}. */
export const memberSelect = (() => {
  return { ...userBaseSelect, lastSeenAt: actorsTable.lastSeenAt };
})();

type UserMinimalBaseKeys = keyof typeof userMinimalBaseSchema.shape;
type UserMinimalBaseSelect = Pick<TableColumns, Exclude<UserMinimalBaseKeys, 'entityType'>>;

/**
 * id, name, slug and thumbnailUrl for createdBy/updatedBy; entityType is added as a SQL literal in joins.
 * @public
 */
export const userMinimalBaseSelect: UserMinimalBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = (Object.keys(userMinimalBaseSchema.shape) as UserMinimalBaseKeys[]).filter((k) => k !== 'entityType');
  return pick(cols, keys as Exclude<UserMinimalBaseKeys, 'entityType'>[]);
})();
