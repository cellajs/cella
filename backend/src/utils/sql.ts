import { type Column, type SQL, sql } from 'drizzle-orm';

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

/**
 * Case- and accent-insensitive substring filter on a text column. Both sides pass through the
 * `fold_search` SQL function, the database side of `foldText` (shared/utils/text-match), so a list
 * filtered in the browser and one filtered here agree on what matches.
 */
export const textSearchFilter = (column: Column, q: string): SQL =>
  sql`fold_search(${column}) like fold_search(${`%${escapeLikePattern(q.trim())}%`})`;
