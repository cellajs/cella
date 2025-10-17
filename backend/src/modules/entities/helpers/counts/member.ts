import { appConfig, type ContextEntityType } from 'config';
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];

/**
 * Generates a query to count the number of admins and members for a specific entity.
 * If an entity is provided, counts are filtered by entity. Otherwise, counts are for all entities.
 *
 * @param entity - The entity type to filter by, or null for counting all entities.
 * @returns Query object that can be executed
 */
export const getMemberCountsQuery = (entityType: ContextEntityType) => {
  const targetEntityIdField = appConfig.entityIdFields[entityType];
  const entityIdColumn = membershipsTable[targetEntityIdField as EntityIdColumnNames];
  if (!entityIdColumn) throw new Error(`Entity ${entityType} does not have an ID column defined`);

  // Subquery to count pending invitations
  const inviteCountSubquery = db
    .select({
      id: tokensTable[targetEntityIdField],
      invites: count().as('invites'),
    })
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'invitation'), isNotNull(tokensTable.entityType), isNull(tokensTable.invokedAt)))
    .groupBy(tokensTable[targetEntityIdField])
    .as('invites');

  return db
    .select({
      id: entityIdColumn,
      admin: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'admin' THEN 1 END`).as('admin'),
      member: count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NOT NULL AND ${membershipsTable.role} = 'member' THEN 1 END`).as('member'),
      pending:
        sql<number>`CAST(${count(sql`CASE WHEN ${membershipsTable.activatedAt} IS NULL THEN 1 END`)} + COALESCE(${inviteCountSubquery.invites}, 0) AS INTEGER)`.as(
          'pending',
        ),

      total: count().as('total'), // Fixed alias to avoid confusion
    })
    .from(membershipsTable)
    .leftJoin(inviteCountSubquery, eq(entityIdColumn, inviteCountSubquery.id))
    .where(and(eq(membershipsTable.contextType, entityType), isNotNull(membershipsTable.activatedAt)))
    .groupBy(entityIdColumn, inviteCountSubquery.invites)
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
    .where(eq(query.id, id))
    .limit(1)
    .then((rows) => rows[0] || { admin: 0, member: 0, pending: 0, total: 0 });
}
