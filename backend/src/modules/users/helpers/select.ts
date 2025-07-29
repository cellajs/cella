import { getTableColumns } from 'drizzle-orm';
import { usersTable } from '#/db/schema/users';
import { userSummarySchema } from '#/modules/entities/schema';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = (() => {
  const { hashedPassword, unsubscribeToken, ...safeUserSelect } = getTableColumns(usersTable);
  return safeUserSelect;
})();

// Infer types of user summary columns
type TableColumns = (typeof usersTable)['_']['columns'];
type UserSummaryKeys = keyof typeof userSummarySchema.shape;
type UserSummarySelect = Pick<TableColumns, UserSummaryKeys>;

/**
 * User select for summary only.
 */
export const userSummarySelect: UserSummarySelect = (() => {
  const userColumns = getTableColumns(usersTable);
  const entries = Object.entries(userSummarySchema.shape).map(([key]) => [key, userColumns[key as UserSummaryKeys]]);
  return Object.fromEntries(entries) as UserSummarySelect;
})();
