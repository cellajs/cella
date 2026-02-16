import { eq, sql } from 'drizzle-orm';
import { type ContextEntityType, hierarchy, roles } from 'shared';
import type z from 'zod';
import { contextCountersTable } from '#/db/schema/context-counters';
import type { membershipCountSchema } from '#/schemas';

/**
 * Returns the LEFT JOIN info and select shape for entity counts from contextCountersTable.
 * Reads pre-computed counts from JSONB instead of running COUNT(*) subqueries.
 *
 * JSONB key conventions:
 *   m:{role}   → membership count by role (e.g. m:admin, m:member)
 *   m:pending  → pending invitations count
 *   m:total    → total active members
 *   e:{type}   → child entity count (e.g. e:attachment)
 *
 * @param entityType - Type of the context entity
 * @returns Object containing:
 *   - contextCountersJoinOn: SQL for LEFT JOIN condition
 *   - countsSelect: SQL columns for counts.membership and counts.entities
 */
export const getEntityCountsSelect = (entityType: ContextEntityType) => {
  const children = hierarchy.getChildren(entityType);

  // Build membership JSON: { admin: N, member: N, ..., pending: N, total: N }
  const roleJsonPairs = roles.all
    .map((role) => `'${role}', GREATEST(0, COALESCE(("context_counters"."counts"->>'m:${role}')::int, 0))`)
    .join(', ');

  // Build entity JSON: { attachment: N, ... }
  const entityJsonPairs = children
    .map((entity) => `'${entity}', GREATEST(0, COALESCE(("context_counters"."counts"->>'e:${entity}')::int, 0))`)
    .join(', ');

  const countsSelect = {
    membership: sql<z.infer<typeof membershipCountSchema>>`
      json_build_object(
        ${sql.raw(roleJsonPairs)},
        'pending', GREATEST(0, COALESCE(("context_counters"."counts"->>'m:pending')::int, 0)),
        'total', GREATEST(0, COALESCE(("context_counters"."counts"->>'m:total')::int, 0))
      )`,
    entities: sql<Record<(typeof children)[number], number>>`json_build_object(${sql.raw(entityJsonPairs)})`,
  };

  return { countsSelect };
};

/**
 * Fetches aggregated counts for a specific entity from contextCountersTable.
 * Single LEFT JOIN on pre-computed JSONB — no COUNT(*) subqueries.
 */
export const getEntityCounts = async (entityType: ContextEntityType, entityId: string) => {
  const { countsSelect } = getEntityCountsSelect(entityType);

  // Import db lazily to avoid circular imports
  const { unsafeInternalDb } = await import('#/db/db');

  const [counts] = await unsafeInternalDb
    .select(countsSelect)
    .from(contextCountersTable)
    .where(eq(contextCountersTable.contextKey, entityId));

  // If no row exists yet, return zeroed counts
  if (!counts) {
    const zeroMembership = Object.fromEntries([...roles.all.map((r) => [r, 0]), ['pending', 0], ['total', 0]]);
    const zeroEntities = Object.fromEntries(hierarchy.getChildren(entityType).map((e) => [e, 0]));
    return {
      membership: zeroMembership as z.infer<typeof membershipCountSchema>,
      entities: zeroEntities as Record<string, number>,
    };
  }

  return counts;
};
