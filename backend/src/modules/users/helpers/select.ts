import { appConfig, type UserFlags } from 'config';
import { getTableColumns, sql } from 'drizzle-orm';
import { usersTable } from '#/db/schema/users';
import { pickColumns } from '#/db/utils/pick-columns';
import { userBaseSchema } from '#/modules/users/schema-base';

/**
 * User select that merges userFlags with default ones
 */
export const userSelect = (() => {
  const { userFlags: _uf, ...safeUserSelect } = getTableColumns(usersTable);

  return {
    ...safeUserSelect,
    // Merge defaults flags with DB ones
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
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
export const userBaseSelect = (() => {
  const cols = getTableColumns(usersTable) satisfies TableColumns;
  const keys = Object.keys(userBaseSchema.shape) as UserBaseKeys[];
  return pickColumns(cols, keys);
})() satisfies UserBaseSelect;

