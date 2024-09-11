import { count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import type { ContextEntity } from '#/types/common';

type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];
const getQuery = (entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames) => {
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

  if (entity) return query.where(eq(membershipsTable.type, entity)).as('counts');

  return query.as('counts');
};

type MemberCounts = { admins: number; members: number; total: number };
// Overload signatures
export function memberCountsQuery(entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames): ReturnType<typeof getQuery>;
export function memberCountsQuery(entity: ContextEntity | null, entityIdColumnName: EntityIdColumnNames, id: string): Promise<MemberCounts>;
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
