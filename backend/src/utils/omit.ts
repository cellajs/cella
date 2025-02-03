import type { PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core';

/**
 * Returns a table select that excludes specified columns.
 *
 * @param obj - drizzle orm's pgTable.
 * @param keys - Columns to omit from the table configuration.
 * @returns A new table configuration with the specified columns omitted.
 */
export const omitKeys = <T extends TableConfig, K extends keyof T['columns']>(obj: PgTableWithColumns<T>, keys: K[] | readonly K[]) => {
  const newObj = { ...obj };
  for (const key of keys) {
    delete newObj[key];
  }
  return newObj;
};
