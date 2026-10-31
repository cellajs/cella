import { and, type Column, or, type SQL, sql } from 'drizzle-orm';
import { parseTerms } from 'shared/utils/text-match';

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

/**
 * Case- and accent-insensitive substring filter on a text column. Both sides pass through the
 * `fold_search` SQL function, the database side of `foldText` (shared/utils/text-match), so a list
 * filtered in the browser and one filtered here agree on what matches. App queries call it per word beside other
 * per-word filters (a label or person match).
 * @public
 */
export const textSearchFilter = (column: Column, q: string): SQL =>
  sql`fold_search(${column}) like fold_search(${`%${escapeLikePattern(q.trim())}%`})`;

/**
 * A list's search over `columns`: every word of `q` (`parseTerms`) is found in some column.
 * @returns undefined when `q` holds no word
 */
export const searchFilter = (columns: Column[], q: string | undefined): SQL | undefined =>
  and(...parseTerms(q).map((term) => or(...columns.map((column) => textSearchFilter(column, term)))));
