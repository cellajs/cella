import { type Column, sql } from 'drizzle-orm';

/** Read an integer key from a JSONB column, defaulting to 0. Floored at 0. */
export const jsonbInt = (col: Column, key: string) => sql<number>`GREATEST(0, COALESCE((${col}->>${key})::int, 0))`;

/** Raw-string variant with the key inlined, for contexts that reject parameters such as `json_build_object`. */
export const jsonbIntRaw = (tableAndCol: string, key: string) => {
  const safeKey = key.replace(/'/g, "''");
  return `GREATEST(0, COALESCE((${tableAndCol}->>'${safeKey}')::int, 0))`;
};

/** Atomic increment for one key, floored at 0: `{ key: GREATEST(0, current + delta) }`. */
export const jsonbIncFragment = (col: Column, key: string, delta: number) => {
  const safeKey = key.replace(/'/g, "''");
  return sql`jsonb_build_object(${sql.raw(`'${safeKey}'`)}, GREATEST(0, COALESCE((${col}->>${sql.raw(`'${safeKey}'`)})::int, 0) + ${delta}::int))`;
};

/** Chained increment over several keys: `col || {key1: val1} || {key2: val2} || ...`. */
export const jsonbIncExpr = (col: Column, deltas: Record<string, number>) => {
  const entries = Object.entries(deltas);
  let expr = sql`${col}`;
  for (const [key, delta] of entries) {
    expr = sql`${expr} || ${jsonbIncFragment(col, key, delta)}`;
  }
  return expr;
};
