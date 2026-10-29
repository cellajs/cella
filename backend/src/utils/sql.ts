import { and, type Column, not, or, type SQL, sql } from 'drizzle-orm';
import { parseSearchQuery } from 'shared/utils/parse-search-query';
import type { MatchMode } from 'shared/utils/text-match';

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const escapeRegexPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
 * Whole-word filter on a text column: `word` (a folded term, so a phrase too) with no letter or digit right before or
 * after it. The database side of `containsWord`, so an exclusion `-api` spares "rapid" here as in the browser. A null
 * column holds no word: false, never null, so `not()` over it keeps the row.
 * @public
 */
export const wordSearchFilter = (column: Column, word: string): SQL =>
  sql`fold_search(coalesce(${column}, '')) ~ ${`(^|[^[:alnum:]])${escapeRegexPattern(word.trim())}([^[:alnum:]]|$)`}`;

/**
 * A list's search over `columns`, in the shared grammar (`parseSearchQuery`): each term is found in some column
 * (every term, or one in `any` mode) and no '-' term is a whole word of any column.
 * @returns undefined when `q` holds no term
 */
export const searchFilter = (columns: Column[], q: string | undefined, mode: MatchMode = 'all'): SQL | undefined => {
  const { terms, excludeTerms } = parseSearchQuery(q);
  const included = terms.map((term) => or(...columns.map((column) => textSearchFilter(column, term))));
  const excluded = excludeTerms.map((term) => not(or(...columns.map((column) => wordSearchFilter(column, term))) ?? sql`false`));
  return and(mode === 'all' ? and(...included) : or(...included), ...excluded);
};
