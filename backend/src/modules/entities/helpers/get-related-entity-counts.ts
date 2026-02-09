import { count, eq, type SelectedFields, type SQL, sql } from 'drizzle-orm';
import type { PgColumn, SubqueryWithSelection } from 'drizzle-orm/pg-core';
import { appConfig, type ContextEntityType, hierarchy } from 'shared';
import { unsafeInternalDb as db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { entityTables } from '#/table-config';

/**
 * Generates a subquery to count related entities for a context entity type.
 * Used for LEFT JOINs in list queries.
 *
 * @param entityType - The context entity type to count related entities for
 * @returns Subquery that can be joined on the entity's id column
 */
export const getRelatedCountsSubquery = (entityType: ContextEntityType) => {
  const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];
  const table = entityTables[entityType];
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  const entityIdColumn = table.id;

  // Only keep entity types that actually contain the ID field we care about
  const validEntities = hierarchy.getChildren(entityType);
  if (!validEntities.length)
    return db.select({ id: entityIdColumn }).from(table).where(sql`false`).as('related_counts');

  const baseCounts: Record<string, SQL.Aliased<number>> = {};
  const joins: {
    subquery: SubqueryWithSelection<
      {
        [x: string]: never;
      },
      string
    >;
    alias: string;
    join: SQL;
  }[] = [];

  for (const relatedEntityType of validEntities) {
    const relatedTable = entityTables[relatedEntityType];
    if (!relatedTable || !(entityIdColumnKey in relatedTable)) continue;
    const alias = `${relatedEntityType}_counts`;
    const fkColumn = relatedTable[entityIdColumnKey as keyof typeof relatedTable] as PgColumn;

    const subquery = db
      .select<SelectedFields<PgColumn, typeof relatedTable>>({
        [entityIdColumnKey]: fkColumn,
        [relatedEntityType]: count().as(relatedEntityType),
      })
      .from(relatedTable)
      .groupBy(fkColumn)
      .as(alias);

    joins.push({ subquery, alias, join: eq(entityIdColumn, subquery[entityIdColumnKey]) });

    baseCounts[relatedEntityType] = sql<number>`COALESCE(${sql.raw(`"${alias}"."${relatedEntityType}"`)}, 0)`.as(
      relatedEntityType,
    );
  }

  const query = db.select({ id: entityIdColumn, ...baseCounts }).from(organizationsTable);

  for (const { subquery, join } of joins) query.leftJoin(subquery, join);

  return query.as('related_counts');
};
