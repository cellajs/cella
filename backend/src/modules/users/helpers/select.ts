import { usersTable } from '#/db/schema/users';
import { userBaseSchema } from '#/modules/entities/schema';
import { appConfig, type UserFlags } from 'config';
import { getTableColumns, sql } from 'drizzle-orm';

/**
 * User select that merges userFlags with default ones
 */
export const userSelect = (() => {
  const { unsubscribeToken, userFlags: _uf, ...safeUserSelect } = getTableColumns(usersTable);

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
export const userBaseSelect: UserBaseSelect = (() => {
  const userColumns = getTableColumns(usersTable);
  const entries = Object.entries(userBaseSchema.shape).map(([key]) => [key, userColumns[key as UserBaseKeys]]);
  return Object.fromEntries(entries) satisfies UserBaseSelect;
})();
