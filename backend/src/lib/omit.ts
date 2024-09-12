import type { PgTableWithColumns, TableConfig } from 'drizzle-orm/pg-core';

export const omitKeys = <T extends TableConfig, K extends keyof T['columns']>(obj: PgTableWithColumns<T>, keys: K[] | readonly K[]) => {
  const newObj = { ...obj };
  for (const key of keys) {
    delete newObj[key];
  }
  return newObj;
};
