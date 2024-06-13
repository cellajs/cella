import { count, eq, sql } from 'drizzle-orm';
import { db } from '../db/db';
import { membershipsTable } from '../db/schema/memberships';
import type { EntityType } from '../types/common';

const getQuery = (entity: EntityType) => {
  let columnName: keyof typeof membershipsTable;

  switch (entity) {
    case 'ORGANIZATION':
      columnName = 'organizationId';
      break;
    case 'PROJECT':
      columnName = 'projectId';
      break;
    default:
      throw new Error(`Invalid entity type: ${entity}`);
  }

  return db
    .select({
      id: membershipsTable[columnName],
      admins: count(sql`CASE WHEN ${membershipsTable.role} = 'ADMIN' THEN 1 ELSE NULL END`).as('admins'),
      members: count().as('members'),
    })
    .from(membershipsTable)
    .where(eq(membershipsTable.type, entity))
    .groupBy(membershipsTable[columnName])
    .as('counts');
};

export function counts<T extends string | undefined = undefined>(
  entity: EntityType,
  id?: T,
): T extends string
  ? Promise<{ memberships: { admins: number; members: number; total: number } }>
  : Promise<ReturnType<typeof getQuery>>;
export async function counts(entity: EntityType, id?: string | undefined) {
  const query = getQuery(entity);

  if (id) {
    const [{ admins, members }] = await db.select().from(query).where(eq(query.id, id));
    return {
      memberships: {
        admins,
        members,
        total: members,
      },
    };
  }

  return query;
}
