import { type Column, sql } from 'drizzle-orm';

/**
 * JSONB counter utilities for reading/writing integer keys in JSONB columns.
 * Shared across contextCountersTable reads (get-entity-counts, CDC) and any
 * future JSONB counter patterns.
 */

/** Read an integer key from a JSONB column, defaulting to 0. Floored at 0. */
export const jsonbInt = (col: Column, key: string) => sql<number>`GREATEST(0, COALESCE((${col}->>${key})::int, 0))`;

/**
 * Build a raw SQL fragment for reading an integer key from a JSONB column.
 * Uses sql.raw() for the key — suitable for building dynamic JSON objects
 * where parameterized keys aren't supported (e.g. json_build_object).
 */
export const jsonbIntRaw = (tableAndCol: string, key: string) => {
  const safeKey = key.replace(/'/g, "''");
  return `GREATEST(0, COALESCE((${tableAndCol}->>'${safeKey}')::int, 0))`;
};

/**
 * Build a JSONB atomic increment expression for a single key.
 * Returns a jsonb_build_object fragment: { key: GREATEST(0, current + delta) }
 *
 * Uses sql.raw() for the key literal — required for jsonb_build_object / GREATEST / COALESCE.
 */
export const jsonbIncFragment = (col: Column, key: string, delta: number) => {
  const safeKey = key.replace(/'/g, "''");
  return sql`jsonb_build_object(${sql.raw(`'${safeKey}'`)}, GREATEST(0, COALESCE((${col}->>${sql.raw(`'${safeKey}'`)})::int, 0) + ${delta}::int))`;
};

/**
 * Build a chained JSONB increment expression for multiple keys.
 * Returns: counts || {key1: val1} || {key2: val2} || ...
 */
export const jsonbIncExpr = (col: Column, deltas: Record<string, number>) => {
  const entries = Object.entries(deltas);
  let expr = sql`${col}`;
  for (const [key, delta] of entries) {
    expr = sql`${expr} || ${jsonbIncFragment(col, key, delta)}`;
  }
  return expr;
};
