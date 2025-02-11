import type { ContextEntity } from 'config';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';

type MemberCounts = { admins: number; members: number; total: number };
type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 * @param entityIdColumnName - The name of the column that represents the entity's ID in the memberships table.
 *
 * @returns Query object that can be executed
 */
const getQuery = (entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames) => {
  // Retrieve the column reference
  const entityIdColumn = membershipsTable[entityIdColumnName];

  if (!entityIdColumn) throw new Error(`Invalid entity ID column name: ${entityIdColumnName}`);

  const query = db
    .select({
      id: entityIdColumn,
      admins: count(sql`CASE WHEN ${membershipsTable.role} = 'admin' THEN 1 ELSE NULL END`).as('admins'),
      members: count().as('members'),
    })
    .from(membershipsTable)
    .groupBy(entityIdColumn);

  // If an entity is provided, add a condition to filter by the entity
  if (entity) return query.where(eq(membershipsTable.type, entity)).as('counts');

  // If no entity is provided, return the base query
  return query.as('counts');
};

// Overload signatures
export function memberCountsQuery(entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames): ReturnType<typeof getQuery>;
export function memberCountsQuery(entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames, id: string): Promise<MemberCounts>;

/**
 * Executes the query to count admins and members for a given entity or entity id.
 * Filters by id, if provided, otherwise, it returns counts for all entities.
 *
 * @param entity - The entity to filter by, or null for all entities.
 * @param entityIdColumnName - The column name for the entity's id.
 * @param id - Optional, id to filter the count by a specific entity instance.
 * @returns - The count of admins, members, and total members.
 */
export function memberCountsQuery(entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames, id?: string) {
  const query = getQuery(entity, entityIdColumnName);

  if (id) {
    return db
      .select({
        admins: query.admins,
        members: query.members,
        total: query.members,
      })
      .from(query)
      .where(eq(query.id, id))
      .then((rows) => rows[0] || { admins: 0, members: 0, total: 0 });
  }

  return query;
}
