import { type ContextEntity, config } from 'config';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityIdFields, entityTables } from '#/entity-config';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 *
 * @returns Query object that can be executed
 */
export const getMemberCountsQuery = (entity: ContextEntity) => {
  const entityIdColumn = membershipsTable[entityIdFields[entity] as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entity} does not have an ID column defined`);

  return db
    .select({
      id: entityIdColumn,
      admins: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'admin' THEN 1 END`).as('admins'),
      members: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'member' THEN 1 END`).as('members'),
      pending: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NULL THEN 1 END`).as('pending'),
      total: count().as('total'), // Fixed alias to avoid confusion
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.type, entity))
    .groupBy(entityIdColumn)
    .as('counts');
};

/**
 * Executes a count query to count admins and members for a given entity or entity id.
 *
 * @param entity - The entity to filter by, or null for all entities.
 * @param id - id to filter the count by a specific entity instance.
 * @returns - The count of admins, members, pending and total members.
 */
export function getMemberCounts(entity: ContextEntity, id: string) {
  const query = getMemberCountsQuery(entity);

  return db
    .select({
      admins: query.admins,
      members: query.members,
      pending: query.pending,
      total: query.total,
    })
    .from(query)
    .where(eq(query.id, id))
    .then((rows) => rows[0] || { admins: 0, members: 0, pending: 0, total: 0 });
}

/**
 * Retrieves the count of related entities(Context and Product) for a specific entity based on its ID.
 *
 * @param entity The entity type (ContextEntity) for which to retrieve related entity counts.
 * @param entityId The unique ID of the entity whose related entity counts are being fetched.
 * @returns An object mapping each entity type to its corresponding count value.
 */
export const getEntityCounts = async (entity: ContextEntity, entityId: string) => {
  const entityIdField = entityIdFields[entity];
  const allEntityTypes = [...config.productEntityTypes, ...config.contextEntityTypes];

  // Array to hold the individual count queries
  const countQueries = [];

  // Loop through each entity type and create the corresponding count query
  for (const entityType of allEntityTypes) {
    const table = entityTables[entityType];

    // Skip if the table doesn't have the required entity ID field
    if (!(entityIdField in table)) continue;

    const countQuery = db
      .select({ [entityType]: count() })
      .from(table)
      .where(eq(table[entityIdField], entityId))
      .then((rows) => rows[0] || { [entityType]: 0 });

    countQueries.push(countQuery);
  }

  const queryResults = await Promise.all(countQueries);

  // Transform the array of results into an object with entity type counts
  const entityCounts = queryResults.reduce((acc, resultRow) => {
    const [[entityType, count]] = Object.entries(resultRow);
    acc[entityType] = count;
    return acc;
  }, {});

  return entityCounts;
};
