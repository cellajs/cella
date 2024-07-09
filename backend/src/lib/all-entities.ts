// import { type AnyColumn, type SQL, type SQLWrapper, and, count, eq, ilike } from 'drizzle-orm';
// import { membershipsTable } from '../db/schema/memberships';
// import { db } from '../db/db';
// import type { PgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core';
// import { getOrderColumn } from './order-column';
// import { counts } from './counts';
// import type { Entity } from '../types/common';
// import { projectsTable } from '../db/schema/projects';
// import { organizationsTable } from '../db/schema/organizations';

// export const getAllEntities = async (
//   entity: Exclude<Entity, 'user'>,
//   {
//     q,
//     sort,
//     order,
//     offset,
//     limit,
//   }: {
//     q: string;
//     sort?: string;
//     order?: 'asc' | 'desc';
//     offset: string;
//     limit: string;
//   },
//   sortOptions: Record<string, AnyColumn | SQLWrapper>,
//   userId: string,
// ) => {
//   let table: PgTableWithColumns<{
//     columns: {
//       id: PgColumn;
//       name: PgColumn;
//     };
//     dialect: 'pg';
//     name: 'memberships';
//     schema: undefined;
//   }>;

//   switch (entity) {
//     case 'organization':
//       table = organizationsTable;
//       break;
//     case 'project':
//       table = projectsTable;
//       break;
//     default:
//       throw new Error('Invalid entity type');
//   }

//   const filter: SQL | undefined = q ? ilike(table.name, `%${q}%`) : undefined;

//   const entitiesQuery = db.select().from(table).where(filter);

//   const [{ total }] = await db.select({ total: count() }).from(entitiesQuery.as('entities'));

//   const memberships = db
//     .select()
//     .from(membershipsTable)
//     .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.type, entity)))
//     .as('memberships');

//   const orderColumn = getOrderColumn(sortOptions, sort, table.id, order);

//   const countsQuery = await counts(entity);

//   const entities = await db
//     .select({
//       entity: table,
//       membership: membershipsTable,
//       admins: countsQuery.admins,
//       members: countsQuery.members,
//     })
//     .from(entitiesQuery.as('entities'))
//     .leftJoin(memberships, eq(table.id, memberships.organizationId))
//     .leftJoin(countsQuery, eq(table.id, countsQuery.id))
//     .orderBy(orderColumn)
//     .limit(Number(limit))
//     .offset(Number(offset));

//   return {
//     entities,
//     total,
//   };
// };
