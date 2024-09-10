import { count, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import type { Entity } from '#/types/common';

type MemberEntity = Exclude<Entity, 'user'>;
type EntityIdColumnNames = keyof (typeof membershipsTable)['_']['columns'];
const getQuery = (entity: MemberEntity, entityIdColumnName: EntityIdColumnNames) => {
  const entityIdColumn = membershipsTable[entityIdColumnName];

  if (!entityIdColumn) {
    throw new Error(`Invalid entity ID column name: ${entityIdColumnName}`);
  }

  return db
    .select({
      id: entityIdColumn,
      admins: count(sql`CASE WHEN ${membershipsTable.role} = 'admin' THEN 1 ELSE NULL END`).as('admins'),
      members: count().as('members'),
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.type, entity))
    .groupBy(entityIdColumn)
    .as('counts');
};

type MemberCounts = { admins: number; members: number; total: number };
export function getMemberCounts<T extends string | undefined = undefined>(
  entity: MemberEntity,
  entityIdColumnName: EntityIdColumnNames,
  id?: T,
): T extends string ? Promise<MemberCounts> : Promise<ReturnType<typeof getQuery>>;
export async function getMemberCounts(entity: MemberEntity, entityIdColumnName: EntityIdColumnNames, id?: string | undefined) {
  const query = getQuery(entity, entityIdColumnName);

  if (id) {
    const [memberships] = await db.select().from(query).where(eq(query.id, id));

    return {
      admins: memberships?.admins || 0,
      members: memberships?.members || 0,
      total: memberships?.members || 0,
    };
  }

  return query;
}
