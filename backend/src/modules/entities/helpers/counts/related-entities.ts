import { appConfig, type ContextEntityType, type ProductEntityType } from 'config';
import { and, count, eq, type SelectedFields, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { PgColumn, SubqueryWithSelection } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { entityTables } from '#/entity-config';
import { getEntityTypesScopedByContextEntityType, type ValidEntities } from '#/modules/entities/helpers/get-related-entities';

/**
 * Counts related entities (Context + Product) for the given entity instance
 * by running one query per entity type instead of a single multi‑join.
 *
 * @param entity          – Base entity type whose ID we’re counting against
 * @param entityId        – ID value of that base entity
 * @param countConditions – Optional extra WHERE fragments per entity type
 *
 * @returns Record mapping each valid entity type to its count
 */
export const getRelatedEntityCounts = async (
  entityType: ContextEntityType,
  entityId: string,
  countConditions: Partial<Record<ProductEntityType | ContextEntityType, SQL>> = {},
) => {
  const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];

  // Only keep entity types that actually contain the ID field we care about
  const validEntities = getEntityTypesScopedByContextEntityType(entityType);
  if (!validEntities.length) return {} as Record<ValidEntities<typeof entityIdColumnKey>, number>;

  // Run one COUNT query per entity type in parallel
  const counts = await Promise.all(
    validEntities.map(async (entityType) => {
      const table = entityTables[entityType];
      const idColumn = table[entityIdColumnKey as keyof typeof table] as SQLWrapper;
      const extraCondition = countConditions[entityType];

      const [row] = await db
        .select({ count: count().as('count') })
        .from(table)
        .where(extraCondition ? and(eq(idColumn, entityId), extraCondition) : eq(idColumn, entityId));

      return [entityType, row?.count ?? 0] as const;
    }),
  );

  // Convert array of tuples → Record<'entityType', number>
  return Object.fromEntries(counts) as Record<ValidEntities<typeof entityIdColumnKey>, number>;
};

export const getRelatedEntityCountsQuery = (entityType: ContextEntityType) => {
  const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];
  const table = entityTables[entityType];
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  const entityIdColumn = table.id; // the target table must match the context — adapt as needed

  // Only keep entity types that actually contain the ID field we care about
  const validEntities = getEntityTypesScopedByContextEntityType(entityType);
  if (!validEntities.length) return db.select({ id: entityIdColumn }).from(table).where(sql`false`).as('related_counts'); // returns zero rows

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

    baseCounts[relatedEntityType] = sql<number>`COALESCE(${sql.raw(`"${alias}"."${relatedEntityType}"`)}, 0)`.as(relatedEntityType);
  }

  const query = db.select({ id: entityIdColumn, ...baseCounts }).from(organizationsTable);

  for (const { subquery, join } of joins) query.leftJoin(subquery, join);

  return query.as('related_counts');
};
