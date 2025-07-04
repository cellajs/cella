import { getTableColumns } from 'drizzle-orm';
import { usersTable } from '#/db/schema/users';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = (() => {
  const { hashedPassword, unsubscribeToken, ...safeUserSelect } = getTableColumns(usersTable);
  return safeUserSelect;
})();

// TODO can we infer the props from the schema? https://chatgpt.com/s/t_6863d9e60880819183725fd04a76631c
/**
 * User select for summary only.
 */
export const userSummarySelect = (() => {
  const { id, name, email, entityType, thumbnailUrl, bannerUrl, slug } = getTableColumns(usersTable);
  return { id, name, email, entityType, thumbnailUrl, bannerUrl, slug };
})();
