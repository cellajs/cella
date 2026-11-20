import { getColumns, getTableName, type Table } from 'drizzle-orm';
import { type SecretColumnsOf, secretColumnsOf } from '#/db/secret-columns';

type ServedColumns<T extends Table> = Omit<T['_']['columns'], SecretColumnsOf<T['_']['name']>>;

/**
 * A table's columns less its `secretColumns`, for a select or a returning whose rows reach a response. It is the runtime
 * twin of `createSelectSchema`: a column the response schema leaves out is never selected for it.
 */
export const servedColumns = <T extends Table>(table: T): ServedColumns<T> => {
  const secrets = new Set(secretColumnsOf(getTableName(table)));
  // Cast: `Object.fromEntries` loses the column record's keys, which the filter keeps but for the secret ones.
  return Object.fromEntries(Object.entries(getColumns(table)).filter(([key]) => !secrets.has(key))) as ServedColumns<T>;
};
