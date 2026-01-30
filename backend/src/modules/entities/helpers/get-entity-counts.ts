import { appConfig, type ContextEntityType, hierarchy } from 'config';
import { eq, sql } from 'drizzle-orm';
import type z from 'zod';
import { db } from '#/db/db';
import { getMemberCountsSubquery } from '#/modules/entities/helpers/get-member-counts';
import { getRelatedCountsSubquery } from '#/modules/entities/helpers/get-related-entity-counts';
import type { membershipCountSchema } from '#/modules/organization/organization-schema';
import { entityTables } from '#/table-config';

/**
 * Returns the subqueries and select shape needed for entity counts.
 * This can be used in both single-entity and list queries.
 *
 * @param entityType - Type of the context entity
 * @returns Object containing:
 *   - memberCountsSubquery: Subquery for membership counts (LEFT JOIN on id)
 *   - relatedCountsSubquery: Subquery for related entity counts (LEFT JOIN on id)
 *   - countsSelect: SQL columns for counts.membership and counts.entities
 */
export const getEntityCountsSelect = (entityType: ContextEntityType) => {
  const memberCountsSubquery = getMemberCountsSubquery(entityType);
  const relatedCountsSubquery = getRelatedCountsSubquery(entityType);

  const validEntities = hierarchy.getChildren(entityType);
  const relatedJsonPairs = validEntities
    .map((entity) => `'${entity}', COALESCE("related_counts"."${entity}", 0)`)
    .join(', ');

  // Build dynamic role JSON pairs from config
  const roleJsonPairs = appConfig.entityRoles
    .map((role) => `'${role}', COALESCE("membership_counts"."${role}", 0)`)
    .join(', ');

  const countsSelect = {
    membership: sql<z.infer<typeof membershipCountSchema>>`
      json_build_object(
        ${sql.raw(roleJsonPairs)},
        'pending', COALESCE(${memberCountsSubquery.pending}, 0),
        'total', COALESCE(${memberCountsSubquery.total}, 0)
      )`,
    entities: sql<Record<(typeof validEntities)[number], number>>`json_build_object(${sql.raw(relatedJsonPairs)})`,
  };

  return { memberCountsSubquery, relatedCountsSubquery, countsSelect };
};

/**
 * Fetches aggregated counts for a specific entity, including:
 *  - Membership counts: number of admins, members, pending invitations, and total members.
 *  - Related entity counts: counts of entities(product | context) related to this entity (e.g., attachments, projects, etc.).
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

  const { memberCountsSubquery, relatedCountsSubquery, countsSelect } = getEntityCountsSelect(entityType);

  const [counts] = await db
    .select(countsSelect)
    .from(table)
    .leftJoin(memberCountsSubquery, eq(table.id, memberCountsSubquery.id))
    .leftJoin(relatedCountsSubquery, eq(table.id, relatedCountsSubquery.id))
    .where(eq(table.id, entityId));

  return counts;
};
