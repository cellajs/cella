import { config } from 'config';
import { type SQL, and, eq, ilike, inArray, notInArray, or } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { entityIdFields, entityTables } from '#/entity-config';
import { membershipSelect } from '#/modules/memberships/helpers/select';
import { prepareStringForILikeFilter } from '#/utils/sql';
import type { suggestionsQuerySchema } from '../schema';

type SuggestionsQueryProps = z.infer<typeof suggestionsQuerySchema> & {
  organizationIds: string[];
  userId: string;
};

export const getSuggestionsQuery = async ({ userId, organizationIds, type, q, entityId }: SuggestionsQueryProps) => {
  const entityTypes = type ? [type] : config.pageEntityTypes;

  const idFields = config.contextEntityTypes.map((entity) => entityIdFields[entity]);

  const membersToExclude =
    type === 'user' && entityId
      ? (
          await db
            .select()
            .from(membershipsTable)
            .where(or(...idFields.map((idField) => eq(membershipsTable[idField], entityId))))
        ).map(({ userId }) => userId)
      : [];

  const queries = entityTypes
    .map((entityType) => {
      const table = entityTables[entityType];
      const entityIdField = entityIdFields[entityType];
      if (!table) return null;

      // Base selection setup including membership details
      const baseSelect = {
        id: table.id,
        slug: table.slug,
        name: table.name,
        entity: table.entity,
        ...('email' in table && { email: table.email }),
        ...('thumbnailUrl' in table && { thumbnailUrl: table.thumbnailUrl }),
      };

      // Perform the join with memberships
      const filters = [
        inArray(membershipsTable.organizationId, organizationIds),
        eq(membershipsTable[entityIdField], table.id),
        ...(entityType !== 'user' ? [eq(membershipsTable.userId, userId)] : []),
        ...(membersToExclude.length ? [notInArray(membershipsTable.userId, membersToExclude)] : []),
      ];

      // Build search filters
      if (q) {
        const query = prepareStringForILikeFilter(q);
        const queryFilters = [ilike(table.name, query), ...('email' in table ? [ilike(table.email, query)] : [])];
        filters.push(or(...queryFilters) as SQL);
      }

      // Execute the query using inner join with memberships table
      return db
        .selectDistinctOn([table.id], {
          ...baseSelect,
          membership: membershipSelect,
        })
        .from(table)
        .innerJoin(
          membershipsTable,
          and(eq(table.id, membershipsTable[entityIdField]), eq(membershipsTable.type, entityType === 'user' ? 'organization' : entityType)),
        )
        .where(and(...filters))
        .limit(10);
    })
    .filter((el) => el !== null); // Filter out null values if any entity type is invalid

  return queries;
};
