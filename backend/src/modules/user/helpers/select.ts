import { appConfig, type UserFlags } from 'config';
import { getTableColumns, sql } from 'drizzle-orm';
import { lastSeenTable } from '#/db/schema/last-seen';
import { type UserModel, usersTable } from '#/db/schema/users';
import { pickColumns } from '#/db/utils/pick-columns';
import { userBaseSchema } from '#/modules/user/user-schema-base';

/**
 * User with lastSeenAt from last_seen table.
 * Used when selecting users with userSelect.
 */
export type UserWithActivity = UserModel & {
  lastSeenAt: string | null;
};

/**
 * User select that merges userFlags with default ones.
 * lastSeenAt is fetched via subquery from last_seen table to avoid CDC noise.
 */
export const userSelect = (() => {
  const { userFlags: _uf, ...safeUserSelect } = getTableColumns(usersTable);

  return {
    ...safeUserSelect,
    // Merge defaults flags with DB ones
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
    // lastSeenAt from last_seen table (subquery to avoid CDC noise on frequent updates)
    lastSeenAt: sql<
      string | null
    >`(SELECT ${lastSeenTable.lastSeenAt} FROM ${lastSeenTable} WHERE ${lastSeenTable.userId} = ${usersTable.id})`,
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
  const cols = getTableColumns(usersTable);
  const keys = Object.keys(userBaseSchema.shape) as UserBaseKeys[];
  return pickColumns(cols, keys);
})();
