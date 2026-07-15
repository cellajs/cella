import { appConfig, hierarchy } from 'shared';

/** Context types that group seen counts, derived from hierarchy parents of tracked entity types */
export const seenGroupingChannelTypes = new Set(
  appConfig.seenTrackedEntityTypes.map((t) => hierarchy.getParent(t)).filter(Boolean),
);

/**
 * Derive the context entity ID for seen-tracking grouping from any entity row.
 * Uses hierarchy to find the parent context type, then reads the matching ID column from the entity.
 */
export function getSeenChannelId(entityType: string, entity: Record<string, unknown>): string {
  const parent = hierarchy.getParent(entityType);
  const key = parent ? appConfig.entityIdColumnKeys[parent] : 'organizationId';
  return String(entity[key] ?? entity.organizationId);
}
