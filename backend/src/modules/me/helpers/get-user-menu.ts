import type { config } from 'config';
import { and, asc, eq, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { entityTables, relationTables } from '#/entity-config';

export const getEntityQuery = (userId: string, type: (typeof config.contextEntityTypes)[number], submenu?: boolean) => {
  const relationTable = submenu ? relationTables[type] : null;
  let query = db
    .select({
      entity: entityTables[type],
      membership: membershipSelect,
      ...(relationTable && { parent: relationTable }),
    })
    .from(entityTables[type])
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.type, type)))
    .orderBy(asc(membershipsTable.order))
    .innerJoin(membershipsTable, eq(membershipsTable[`${type}Id`], entityTables[type].id));
  if (relationTable && `${type}Id` in relationTable.$inferSelect) {
    query = query.innerJoin(relationTable, or(eq(relationTable.id, entityTables[type].id), eq(relationTable[`${type}Id`], entityTables[type].id)));
  }

  return query;
};
