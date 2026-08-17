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
 * Resolves the deepest non-null ancestor (the row's effective home), matching mark-seen,
 * unseen counts and unseen-sync; parent-then-org would diverge for nullableAncestors placements.
 */
export function getSeenChannelId(entityType: ProductEntityType, entity: Record<string, unknown>): string {
  return String(hierarchy.resolveDeepestAncestorId(entityType, entity) ?? entity.organizationId);
}

/**
 * Mirror server unseen exclusions when applying client badge deltas, including unpublished drafts.
 * App-specific feed filters must be added here to prevent drift before exact recounts.
 */
export function matchesUnseenFilters(_entityType: ProductEntityType, row: Record<string, unknown>): boolean {
  return row.publishedAt !== null;
}
