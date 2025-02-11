import type { ContextEntity } from 'config';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityIdFields } from '#/entity-config';

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
    .groupBy(entityIdColumn)
    .where(eq(membershipsTable.type, entity))
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
