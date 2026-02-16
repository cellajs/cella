import { type ContextEntityType, hierarchy, roles } from 'shared';
import { unsafeInternalDb as db } from '#/db/db';
import { contextCountersTable } from '#/db/schema/context-counters';

/**
 * Build the initial JSONB counts for a new context entity.
 *
 * @param entityType - The context entity type (e.g. 'organization')
 * @param creatorRole - The role of the creator (defaults to 'admin')
 * @returns JSONB-ready counts object with m:{role}, m:pending, m:total, e:{child}
 */
export const buildInitialCounts = (
  entityType: ContextEntityType,
  creatorRole: string = 'admin',
): Record<string, number> => ({
  ...Object.fromEntries(roles.all.map((role) => [`m:${role}`, role === creatorRole ? 1 : 0])),
  'm:pending': 0,
  'm:total': 1,
  ...Object.fromEntries(hierarchy.getChildren(entityType).map((e) => [`e:${e}`, 0])),
});

/**
 * Insert initial context counter rows for newly created context entities.
 * Uses ON CONFLICT DO NOTHING so it's safe if CDC processes the insert first.
 *
 * @param entityType - The context entity type (e.g. 'organization')
 * @param entityIds - IDs of the created entities
 * @param creatorRole - The role of the creator (defaults to 'admin')
 */
export const initContextCounters = async (
  entityType: ContextEntityType,
  entityIds: string[],
  creatorRole = 'admin',
) => {
  if (entityIds.length === 0) return;

  const counts = buildInitialCounts(entityType, creatorRole);

  await db
    .insert(contextCountersTable)
    .values(entityIds.map((id) => ({ contextKey: id, counts })))
    .onConflictDoNothing();
};
