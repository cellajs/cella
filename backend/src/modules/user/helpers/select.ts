import { getColumns, sql } from 'drizzle-orm';
import { appConfig, type UserFlags } from 'shared';
import { userActivityTable } from '#/db/schema/user-activity';
import { type UserModel, usersTable } from '#/db/schema/users';
import { pickColumns } from '#/db/utils/pick-columns';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { userBaseSchema } from '#/schemas/user-schema-base';

/**
 * User with activity timestamps from user_activity table.
 * Used when selecting users with userSelect.
 */
export type UserWithActivity = UserModel & {
  lastSeenAt: string | null;
  lastStartedAt: string | null;
  lastSignInAt: string | null;
};

/**
 * User select that merges userFlags with default ones.
 * Activity timestamps are fetched via subqueries from user_activity table to avoid CDC noise.
 */
export const userSelect = (() => {
  const { userFlags: _uf, ...safeUserSelect } = getColumns(usersTable);

  return {
    ...safeUserSelect,
    // Merge defaults flags with DB ones
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
    // Activity timestamps from user_activity table (subqueries to avoid CDC noise on frequent updates)
    lastSeenAt: sql<
      string | null
    >`(SELECT ${userActivityTable.lastSeenAt} FROM ${userActivityTable} WHERE ${userActivityTable.userId} = ${usersTable.id})`,
    lastStartedAt: sql<
      string | null
    >`(SELECT ${userActivityTable.lastStartedAt} FROM ${userActivityTable} WHERE ${userActivityTable.userId} = ${usersTable.id})`,
    lastSignInAt: sql<
      string | null
    >`(SELECT ${userActivityTable.lastSignInAt} FROM ${userActivityTable} WHERE ${userActivityTable.userId} = ${usersTable.id})`,
  };
})();

/**
 * Member select. unnecessary fields are omitted from user select.
 */
export const memberSelect = (() => {
  const { newsletter, userFlags, ...memberSafe } = userSelect;
  return memberSafe;
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
  return pickColumns(cols, keys);
})();

// Infer types of user minimal base columns
type UserMinimalBaseKeys = keyof typeof userMinimalBaseSchema.shape;
type UserMinimalBaseSelect = Pick<TableColumns, Exclude<UserMinimalBaseKeys, 'entityType'>>;

/**
 * User select for minimal base data only (id, name, slug, thumbnailUrl, email).
 * Used for embedding user data in createdBy/modifiedBy fields.
 * entityType is excluded since it's always 'user' and added as a SQL literal in joins.
 */
export const userMinimalBaseSelect: UserMinimalBaseSelect = (() => {
  const cols = getColumns(usersTable);
  const keys = (Object.keys(userMinimalBaseSchema.shape) as UserMinimalBaseKeys[]).filter((k) => k !== 'entityType');
  return pickColumns(cols, keys as Exclude<UserMinimalBaseKeys, 'entityType'>[]);
})();
