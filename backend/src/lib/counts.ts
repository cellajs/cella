import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import type { ContextEntity } from '#/types/common';
import { count, eq, sql } from 'drizzle-orm';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];
const getQuery = (entityIdColumnName: EntityIdColumnNames, entity?: ContextEntity) => {
  const entityIdColumn = membershipsTable[entityIdColumnName];

  if (!entityIdColumn) {
    throw new Error(`Invalid entity ID column name: ${entityIdColumnName}`);
  }

  const query = db
    .select({
      id: entityIdColumn,
      admins: count(sql`CASE WHEN ${membershipsTable.role} = 'admin' THEN 1 ELSE NULL END`).as('admins'),
      members: count().as('members'),
    })
    .from(membershipsTable)
    .groupBy(entityIdColumn);

  if (entity) return query.where(eq(membershipsTable.type, entity)).as('counts');

  return query.as('counts');
};

type MemberCounts = { admins: number; members: number; total: number };
// Overload signatures
export function memberCountsQuery(entityIdColumnName: EntityIdColumnNames, entity?: ContextEntity): ReturnType<typeof getQuery>;
export function memberCountsQuery(entityIdColumnName: EntityIdColumnNames, entity?: ContextEntity, id?: string): Promise<MemberCounts>;
export function memberCountsQuery(entityIdColumnName: EntityIdColumnNames, entity?: ContextEntity, id?: string) {
  const query = getQuery(entityIdColumnName, entity);

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
