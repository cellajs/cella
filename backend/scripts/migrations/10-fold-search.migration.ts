import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * `fold_search(text)`: the database side of `foldText` (shared/utils/text-match). Lowercase, NFD,
 * combining marks removed, so a term folded in the application matches a column folded here.
 * `normalize()` is core PostgreSQL (14+), no extension. IMMUTABLE admits an expression index on
 * `fold_search(column)` once a table needs one.
 */
async function run(): Promise<SideEffectBlock> {
  const migrationSql = `-- Search folding
-- fold_search(text): case- and accent-insensitive comparison for text search filters.

CREATE OR REPLACE FUNCTION fold_search(text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN regexp_replace(normalize(lower($1), NFD), '[\\u0300-\\u036f]', '', 'g');
`;

  return {
    tag: 'search_functions',
    title: 'Search folding, fold_search',
    sql: migrationSql,
    notes: ['Function: fold_search(text) → text'],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Search folding',
  produce: run,
};
