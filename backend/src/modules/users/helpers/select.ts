import { appConfig, type UserFlags } from 'config';
import { getTableColumns, sql } from 'drizzle-orm';
import { usersTable } from '#/db/schema/users';
import { userBaseSchema } from '#/modules/entities/schema';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = (() => {
  const { hashedPassword, unsubscribeToken, userFlags: _uf, ...safeUserSelect } = getTableColumns(usersTable);

  return {
    ...safeUserSelect,
    // Merge defaults flags with DB ones
    userFlags: sql<UserFlags>` ${JSON.stringify(appConfig.defaultUserFlags)}::jsonb  || ${usersTable.userFlags}`,
  };
})();

// Infer types of user summary columns
type TableColumns = (typeof usersTable)['_']['columns'];
type UserSummaryKeys = keyof typeof userBaseSchema.shape;
type UserSummarySelect = Pick<TableColumns, UserSummaryKeys>;

/**
 * User select for summary only.
 */
export const userSummarySelect: UserSummarySelect = (() => {
  const userColumns = getTableColumns(usersTable);
  const entries = Object.entries(userBaseSchema.shape).map(([key]) => [key, userColumns[key as UserSummaryKeys]]);
  return Object.fromEntries(entries) as UserSummarySelect;
})();
