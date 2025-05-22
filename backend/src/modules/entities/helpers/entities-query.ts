import { type ContextEntity, config } from 'config';
import { type SQLWrapper, and, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { entityTables } from '#/entity-config';
import type { entityListQuerySchema } from '#/modules/entities/schema';
import { membershipSelect } from '#/modules/memberships/helpers/select';
import { prepareStringForILikeFilter } from '#/utils/sql';

type EntitiesQueryProps = Omit<z.infer<typeof entityListQuerySchema>, 'targetUserId' | 'targetOrgId'> & {
  organizationIds: string[];
  selfId: string;
  userId: string;
};

type UserEntitiesQueryProps = Omit<EntitiesQueryProps, 'userId'>;
type ContextEntitiesQueryProps = Omit<EntitiesQueryProps, 'userMembershipType' | 'selfId' | 'type'> & { type?: ContextEntity };

export const getEntitiesQuery = ({ q, organizationIds, userId, selfId, type, userMembershipType }: EntitiesQueryProps) => {
  return !type
    ? [...getUsersQuery({ q, organizationIds, selfId, userMembershipType }), ...getContextEntitiesQuery({ q, userId, organizationIds })]
    : type === 'user'
      ? getUsersQuery({ q, organizationIds, selfId, userMembershipType })
      : getContextEntitiesQuery({ q, organizationIds, userId, type });
};

/**
 * Creates a queries with max 20 uniqe entities each. Query return entities that part of organizations where passed user have memberships
 * and match the provided search query. Default will return query for all context entities if type is not provided.
 */
const getContextEntitiesQuery = ({ q, organizationIds, userId, type }: ContextEntitiesQueryProps) => {
  const contextEntities = type ? [type] : config.contextEntities;

  const contextQueries = contextEntities
    .map((entityType) => {
      const table = entityTables[entityType];
      const entityIdField = config.entityIdFields[entityType];
      if (!table) return null;

      const filters = [
        'organizationId' in table ? inArray(table.organizationId as SQLWrapper, organizationIds) : inArray(table.id, organizationIds),
        ...(q ? [ilike(table.name, prepareStringForILikeFilter(q))] : []),
      ];

      return db
        .selectDistinctOn([table.id], {
          id: table.id,
          slug: table.slug,
          name: table.name,
          entity: table.entity,
          thumbnailUrl: table.thumbnailUrl,
          membership: membershipSelect,
          total: sql<number>`COUNT(*) OVER()`.as('total'),
        })
        .from(table)
        .leftJoin(
          membershipsTable,
          and(eq(membershipsTable[entityIdField], table.id), eq(membershipsTable.userId, userId), eq(membershipsTable.contextType, entityType)),
        )
        .where(and(...filters))
        .limit(20);
    })
    .filter((el) => el !== null); // Filter out null values if any entity type is invalid

  return contextQueries;
};

/**
 * Creates a query with max 20 unique users. Query return users that share with you organizations membership and match the provided
 * search query, excluding self.
 */
const getUsersQuery = ({ q, organizationIds, selfId, userMembershipType }: UserEntitiesQueryProps) => {
  const usersQuery = db
    .selectDistinctOn([usersTable.id], {
      id: usersTable.id,
      slug: usersTable.slug,
      name: usersTable.name,
      entity: usersTable.entity,
      email: usersTable.email,
      thumbnailUrl: usersTable.thumbnailUrl,
      membership: membershipSelect,
      total: sql<number>`COUNT(*) OVER()`.as('total'),
    })
    .from(usersTable)
    .leftJoin(
      membershipsTable,
      and(eq(membershipsTable.userId, usersTable.id), eq(membershipsTable.contextType, userMembershipType ?? 'organization')),
    )
    .where(
      and(
        inArray(membershipsTable.organizationId, organizationIds),
        ...(q ? [or(ilike(usersTable.name, prepareStringForILikeFilter(q))), ilike(usersTable.email, prepareStringForILikeFilter(q))] : []),
        eq(membershipsTable.userId, usersTable.id),
        // in user searches exclude self from results
        ...(selfId ? [ne(membershipsTable.userId, selfId)] : []),
      ),
    )
    .limit(20);

  return [usersQuery];
};
