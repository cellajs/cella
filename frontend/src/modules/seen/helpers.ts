import { appConfig, hierarchy, type ProductEntityType } from 'shared';

/** Query key for the unseen-counts cache (fetched in query.ts, patched in unseen-delta.ts) */
export const seenKeys = {
  unseenCounts: ['me', 'unseen', 'counts'],
};

/** Whether an entity type is configured for seen tracking */
export const isSeenTracked = (entityType: string): boolean =>
  (appConfig.seenTrackedEntityTypes as readonly string[]).includes(entityType);

/** Context types that group seen counts, derived from hierarchy parents of tracked entity types */
export const seenGroupingChannelTypes = new Set(
  appConfig.seenTrackedEntityTypes.map((t) => hierarchy.getParent(t)).filter(Boolean),
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
 * Fork extension point: extra row filters mirroring the server's unseen predicate
 * (`findUnseenCountsByUser`). Cella filters unpublished drafts to mirror `publishedAt`
 * lifecycle feeds. Synced rows should never carry one, so the check is defensive. A fork
 * whose feeds exclude more rows must mirror that exclusion here,
 * or badge deltas drift until the next exact recount.
 */
export function matchesUnseenFilters(_entityType: ProductEntityType, row: Record<string, unknown>): boolean {
  return row.publishedAt !== null;
}
