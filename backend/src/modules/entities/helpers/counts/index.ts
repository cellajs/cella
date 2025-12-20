import type { ContextEntityType } from 'config';
import { eq, sql } from 'drizzle-orm';
import type z from 'zod';
import { db } from '#/db/db';
import { entityTables } from '#/entity-config';
import { getMemberCountsQuery } from '#/modules/entities/helpers/counts/member';
import { getRelatedEntityCountsQuery } from '#/modules/entities/helpers/counts/related-entities';
import { getEntityTypesScopedByContextEntityType } from '#/modules/entities/helpers/get-related-entities';
import type { membershipCountSchema } from '#/modules/organizations/schema';

/**
 * Fetches aggregated counts for a specific entity, including:
 *  - Membership counts: number of admins, members, pending invitations, and total members.
 *  - Related entity counts: counts of entities(product | context) related to this entity (e.g., attachments, projects, etc.).
 *
 * The function performs:
 * - Builds a subquery to get membership counts (`getMemberCountsQuery`).
 * - Builds a subquery to get counts of related entities (`getRelatedEntityCountsQuery`).
 * - Generates a JSON mapping for the related entities dynamically based on the valid related entity types.
 * - Executes a SQL query
 *
 * @param entityType - Type of the context entity
 * @param entityId - The ID of the entity to fetch counts for.
 * @returns An object containing:
 *    - membership: JSON object with counts of admin, member, pending, and total members.
 *    - entities: JSON object with counts of related entities, keyed by entity type.
 */
export const getEntityCounts = async (entityType: ContextEntityType, entityId: string) => {
  const table = entityTables[entityType];
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  const membershipCountsQuery = getMemberCountsQuery(entityType);
  const relatedCountsQuery = getRelatedEntityCountsQuery(entityType);

  const validEntities = getEntityTypesScopedByContextEntityType(entityType);
  const relatedJsonPairs = validEntities
    .map((entity) => `'${entity}', COALESCE("related_counts"."${entity}", 0)`)
    .join(', ');

  const [counts] = await db
    .select({
      membership: sql<z.infer<typeof membershipCountSchema>>`
          json_build_object(
            'admin', COALESCE(${membershipCountsQuery.admin}, 0), 
            'member', COALESCE(${membershipCountsQuery.member}, 0), 
            'pending', COALESCE(${membershipCountsQuery.pending}, 0), 
            'total', COALESCE(${membershipCountsQuery.total}, 0)
          )`,
      entities: sql<Record<(typeof validEntities)[number], number>>`json_build_object(${sql.raw(relatedJsonPairs)})`,
    })
    .from(table)
    .leftJoin(membershipCountsQuery, eq(table.id, membershipCountsQuery.id))
    .leftJoin(relatedCountsQuery, eq(table.id, relatedCountsQuery.id))
    .where(eq(table.id, entityId));

  return counts;
};
