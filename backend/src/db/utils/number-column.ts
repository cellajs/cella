import { type SQL, sql } from 'drizzle-orm';
import { integer, type PgColumn, uniqueIndex } from 'drizzle-orm/pg-core';
import { appConfig, hierarchy, type ProductEntityType } from 'shared';

/** Number in the home channel, as in `/{code}/a7`: 0 until `assign_product_number()` sets it, which skips unnumbered types. */
export const numberColumn = { number: integer().notNull().default(0) };

/** The home channel id as the numbering trigger reads it: the COALESCE of the ancestors when the deepest is nullable. */
export const homeChannelId = (table: object, entityType: ProductEntityType): PgColumn | SQL => {
  const columns = table as Record<string, PgColumn>;
  const [deepest, ...outer] = hierarchy.getOrderedAncestors(entityType).map((type) => columns[appConfig.entityIdColumnKeys[type]]);
  return deepest.notNull || !outer.length ? deepest : sql`coalesce(${sql.join([deepest, ...outer], sql`, `)})`;
};

/** The unique index of the numbers per home channel, named `<table>_home_number_unique`; 0, an unnumbered row, repeats. */
export const homeNumberIndex = (tableName: string, table: { number: PgColumn }, entityType: ProductEntityType) =>
  uniqueIndex(`${tableName}_home_number_unique`).on(homeChannelId(table, entityType), table.number).where(sql`${table.number} > 0`);
