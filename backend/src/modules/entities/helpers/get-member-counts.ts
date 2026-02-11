import { count, eq, isNull, sql } from 'drizzle-orm';
import { appConfig, type ContextEntityType, roles } from 'shared';
import type { DbOrTx } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];
type InactiveEntityIdColumnNames = keyof (typeof inactiveMembershipsTable)['_']['columns'];

function getEntityIdColumn(entityType: ContextEntityType) {
  const targetEntityIdField = appConfig.entityIdColumnKeys[entityType];
  const entityIdColumn = membershipsTable[targetEntityIdField as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entityType} does not have an ID column defined`);
  return entityIdColumn;
}

function getInactiveEntityIdColumn(entityType: ContextEntityType) {
  const targetEntityIdField = appConfig.entityIdColumnKeys[entityType];
  return inactiveMembershipsTable[targetEntityIdField as InactiveEntityIdColumnNames];
}

/**
 * Generates a subquery to count the number of admins and members for a specific entity type.
 * Used for LEFT JOINs in list queries.
 *
 * @param db - Database connection
 * @param entityType - The context entity type to count members for
 * @returns Subquery that can be joined on the entity's id column
 */
export const getMemberCountsSubquery = (db: DbOrTx, entityType: ContextEntityType) => {
  const entityIdColumn = getEntityIdColumn(entityType);

  if (!entityIdColumn) throw new Error(`Entity ${entityType} does not have an ID column defined`);

  const inactiveEntityIdColumn = getInactiveEntityIdColumn(entityType);

  const inviteCountSubquery = db
    .select({
      id: inactiveEntityIdColumn,
      invites: count().as('invites'),
    })
    .from(inactiveMembershipsTable)
    .where(isNull(inactiveMembershipsTable.rejectedAt))
    .groupBy(inactiveEntityIdColumn)
    .as('invites');

  // Build dynamic role count columns from config
  const roleCountColumns = Object.fromEntries(
    roles.all.map((role) => [role, count(sql`CASE WHEN ${membershipsTable.role} = ${role} THEN 1 END`).as(role)]),
  );

  return db
    .select({
      id: entityIdColumn,
      ...roleCountColumns,
      pending: sql<number>`CAST(COALESCE(MAX(${inviteCountSubquery.invites}), 0) AS INTEGER)`.as('pending'),
      total: count().as('total'),
    })
    .from(membershipsTable)
    .leftJoin(inviteCountSubquery, eq(entityIdColumn, inviteCountSubquery.id))
    .where(eq(membershipsTable.contextType, entityType))
    .groupBy(entityIdColumn)
    .as('membership_counts');
};
