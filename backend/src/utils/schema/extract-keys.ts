import type { PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core';

/**
 * Returns a table select that include only specified columns.
 *
 * @param obj - drizzle orm's pgTable.
 * @param keys - Columns to select from the table configuration.
 * @returns A new table configuration with specified columns.
 */
export const extractKeys = <T extends TableConfig, K extends keyof T['columns']>(obj: PgTableWithColumns<T>, keys: K[] | readonly K[]) => {
  const extractedObj = {} as Pick<PgTableWithColumns<T>, K>;

  for (const key of keys) {
    if (key in obj) extractedObj[key] = obj[key];
  }

  return extractedObj;
};
