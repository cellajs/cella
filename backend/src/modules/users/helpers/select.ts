import { appConfig, type UserFlags } from 'config';
import { getTableColumns, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { userBaseSchema } from '#/modules/entities/schema';

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
export const userBaseSelect: UserBaseSelect = (() => {
  const userColumns = getTableColumns(usersTable);
  const entries = Object.entries(userBaseSchema.shape).map(([key]) => [key, userColumns[key as UserBaseKeys]]);
  return Object.fromEntries(entries) satisfies UserBaseSelect;
})();

/**
 * Base query for selecting users.
 *
 * - Always selects from `usersTable` using the predefined `userSelect` shape.
 *
 * This query is meant to be extended (e.g., with additional joins or filters)
 * wherever user data needs to be fetched consistently.
 */
export const usersBaseQuery = (() => db.select(userSelect).from(usersTable))();
