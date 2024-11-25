import type { PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core';

// Returns a table select that omits specified keys from the given table configuration object.
export const omitKeys = <T extends TableConfig, K extends keyof T['columns']>(obj: PgTableWithColumns<T>, keys: K[] | readonly K[]) => {
  const newObj = { ...obj };
  for (const key of keys) {
    delete newObj[key];
  }
  return newObj;
};
