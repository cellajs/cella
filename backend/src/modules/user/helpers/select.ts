import { getColumns, sql } from 'drizzle-orm';
import { appConfig, type UserFlags } from 'shared';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { pick } from '#/utils/pick';

/**
 * User with timestamps from user_counters table.
 * Used when selecting users with userSelect.
 */
export type UserWithCounters = UserModel & {
  lastSeenAt: string | null;
  lastStartedAt: string | null;
  lastSignInAt: string | null;
};

/**
 * User select that merges userFlags with default ones.
 * Timestamps are fetched via subqueries from user_counters table to avoid CDC noise.
 */
export const userSelect = (() => {
  const { userFlags: _uf, ...safeUserSelect } = getColumns(usersTable);

  return {
    ...safeUserSelect,
    // Merge defaults flags with DB ones
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
    // Timestamps from user_counters table (subqueries to avoid CDC noise on frequent updates)
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

// Infer types of user base columns
type TableColumns = (typeof usersTable)['_']['columns'];
type UserBaseKeys = keyof typeof userBaseSchema.shape;
type UserBaseSelect = Pick<TableColumns, UserBaseKeys>;

/**
 * User select for base data only.
 */
export const userBaseSelect: UserBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = Object.keys(userBaseSchema.shape) as UserBaseKeys[];
  return pick(cols, keys);
})();

/**
 * Member select — returns only userBaseSelect columns + lastSeenAt.
 * Used for cross-tenant user endpoints and member lists.
 */
export const memberSelect = (() => {
  return {
    ...userBaseSelect,
    lastSeenAt: sql<
      string | null
    >`(SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
  };
})();

// Infer types of user minimal base columns
type UserMinimalBaseKeys = keyof typeof userMinimalBaseSchema.shape;
type UserMinimalBaseSelect = Pick<TableColumns, Exclude<UserMinimalBaseKeys, 'entityType'>>;

/**
 * User select for minimal base data only (id, name, slug, thumbnailUrl).
 * Used for embedding user data in createdBy/updatedBy fields.
 * entityType is excluded since it's always 'user' and added as a SQL literal in joins.
 */
export const userMinimalBaseSelect: UserMinimalBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = (Object.keys(userMinimalBaseSchema.shape) as UserMinimalBaseKeys[]).filter((k) => k !== 'entityType');
  return pick(cols, keys as Exclude<UserMinimalBaseKeys, 'entityType'>[]);
})();
