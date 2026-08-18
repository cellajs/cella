import { getColumns, sql } from 'drizzle-orm';
import { appConfig, type UserFlags } from 'shared';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { pick } from '#/utils/pick';

/** User with timestamps from the user_counters table. */
export type UserWithCounters = UserModel & {
  lastSeenAt: string | null;
  lastStartedAt: string | null;
  lastSignInAt: string | null;
};

/** Merges userFlags with the defaults; timestamps come from user_counters subqueries to avoid CDC noise. */
export const userSelect = (() => {
  const { userFlags: _uf, ...safeUserSelect } = getColumns(usersTable);
  return {
    ...safeUserSelect,
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
    lastSeenAt: sql<
      string | null
    >`(SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
    lastStartedAt: sql<
      string | null
    >`(SELECT ${userCountersTable.lastStartedAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
    lastSignInAt: sql<
      string | null
    >`(SELECT ${userCountersTable.lastSignInAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
  };
})();

type TableColumns = (typeof usersTable)['_']['columns'];
type UserBaseKeys = keyof typeof userBaseSchema.shape;
type UserBaseSelect = Pick<TableColumns, UserBaseKeys>;

export const userBaseSelect: UserBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = Object.keys(userBaseSchema.shape) as UserBaseKeys[];
  return pick(cols, keys);
})();

/** Limited to userBaseSelect columns plus lastSeenAt, for cross-tenant user endpoints and member lists. */
export const memberSelect = (() => {
  return {
    ...userBaseSelect,
    lastSeenAt: sql<
      string | null
    >`(SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
  };
})();

type UserMinimalBaseKeys = keyof typeof userMinimalBaseSchema.shape;
type UserMinimalBaseSelect = Pick<TableColumns, Exclude<UserMinimalBaseKeys, 'entityType'>>;

/** id, name, slug and thumbnailUrl for createdBy/updatedBy; entityType is added as a SQL literal in joins. */
export const userMinimalBaseSelect: UserMinimalBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = (Object.keys(userMinimalBaseSchema.shape) as UserMinimalBaseKeys[]).filter((k) => k !== 'entityType');
  return pick(cols, keys as Exclude<UserMinimalBaseKeys, 'entityType'>[]);
})();
