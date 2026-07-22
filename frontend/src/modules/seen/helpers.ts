import { appConfig, hierarchy, type ProductEntityType } from 'shared';

/** Query key for the unseen-counts cache (fetched in query.ts, patched in unseen-delta.ts) */
export const seenKeys = {
  unseenCounts: ['me', 'unseen', 'counts'],
};

/** Whether an entity type is configured for seen tracking */
export const isSeenTracked = (entityType: string): boolean =>
  (appConfig.seenTrackedProductTypes as readonly string[]).includes(entityType);

/** Context types that group seen counts, derived from hierarchy parents of tracked entity types */
export const seenGroupingChannelTypes = new Set(
  appConfig.seenTrackedProductTypes.map((t) => hierarchy.getParent(t)).filter(Boolean),
);

/**
 * Derive the channel entity ID for seen-tracking grouping from any entity row.
 * Uses hierarchy to find the parent context type, then reads the matching ID column from the entity.
 */
export function getSeenChannelId(entityType: ProductEntityType, entity: Record<string, unknown>): string {
  const parent = hierarchy.getParent(entityType);
  const key = parent ? appConfig.entityIdColumnKeys[parent] : 'organizationId';
  return String(entity[key] ?? entity.organizationId);
}

/**
 * Mirror server unseen exclusions when applying client badge deltas, including unpublished drafts.
 * Fork-specific feed filters must be added here to prevent drift before exact recounts.
 */
export function matchesUnseenFilters(_entityType: ProductEntityType, row: Record<string, unknown>): boolean {
  return row.publishedAt !== null;
}
