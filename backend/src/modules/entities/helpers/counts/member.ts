import { appConfig, type ContextEntityType } from 'config';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

function getEntityIdColumn(entityType: ContextEntityType) {
  const targetEntityIdField = appConfig.entityIdFields[entityType];
  const entityIdColumn = membershipsTable[targetEntityIdField as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entityType} does not have an ID column defined`);
  return entityIdColumn;
}

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 * @returns Query object that can be executed
 */
export const getMemberCountsQuery = (entityType: ContextEntityType) => {
  return db
    .select({
      id: getEntityIdColumn(entityType),
      admin: count(sql`CASE WHEN ${membershipsTable.role} = 'admin' THEN 1 END`).as('admin'),
      member: count(sql`CASE WHEN ${membershipsTable.role} = 'member' THEN 1 END`).as('member'),
      pending: count(sql`CASE WHEN ${inactiveMembershipsTable.rejectedAt} IS NULL THEN 1 END`).as('pending'),
      total: count().as('total'),
    })
    .from(membershipsTable)
    .leftJoin(inactiveMembershipsTable, eq(membershipsTable.contextType, entityType))
    .where(eq(membershipsTable.contextType, entityType))
    .as('membership_counts');
};

/**
 * Executes a count query to count admins and members for a given entity or entity id.
 *
 * @param entityType - The entity to filter by, or null for all entities.
 * @param id - id to filter the count by a specific entity instance.
 * @returns The count of admins, members, pending and total members.
 */
export function getMemberCounts(entityType: ContextEntityType, id: string) {
  const query = getMemberCountsQuery(entityType);

  return db
    .select({
      admin: query.admin,
      member: query.member,
      pending: query.pending,
      total: query.total,
    })
    .from(query)
    .where(eq(getEntityIdColumn(entityType), id))
    .limit(1)
    .then((rows) => rows[0] || { admin: 0, member: 0, pending: 0, total: 0 });
}
