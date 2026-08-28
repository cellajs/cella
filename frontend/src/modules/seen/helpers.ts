import { appConfig, hierarchy, type ProductEntityType } from 'shared';

export const seenKeys = {
  unseenCounts: ['me', 'unseen', 'counts'],
};

export const isSeenTracked = (entityType: string): boolean =>
  (appConfig.seenTrackedProductTypes as readonly string[]).includes(entityType);

/** Every channel type a seen-tracked product can be homed in; mirrors the server's grouping set in mark-seen.ts. */
export const seenGroupingChannelTypes = new Set(
  appConfig.seenTrackedProductTypes.flatMap((t) => hierarchy.possibleHomeChannels(t)),
);

/** Grouping channel for a row: its deepest non-null ancestor, matching mark-seen, unseen counts and unseen-sync. */
export function getSeenChannelId(entityType: ProductEntityType, entity: Record<string, unknown>): string {
  return String(hierarchy.resolveDeepestAncestorId(entityType, entity) ?? entity.organizationId);
}

/** Mirrors the server's unseen exclusions (unpublished drafts included); app feed filters belong here too. */
export function matchesUnseenFilters(_entityType: ProductEntityType, row: Record<string, unknown>): boolean {
  return row.publishedAt !== null;
}
