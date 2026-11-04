import { hierarchy, type ProductEntityType } from 'shared';

export const seenKeys = { unseenCounts: ['me', 'unseen', 'counts'] };

/**
 * Grouping channel for a row: its deepest non-null ancestor, matching mark-seen, unseen counts and unseen-sync.
 * @public
 */
export function getSeenChannelId(entityType: ProductEntityType, entity: Record<string, unknown> & { organizationId: string }): string {
  return hierarchy.resolveDeepestAncestorId(entityType, entity) ?? entity.organizationId;
}

/** Mirrors the server's unseen exclusions (unpublished drafts included); app feed filters belong here too. */
export function matchesUnseenFilters(_entityType: ProductEntityType, row: Record<string, unknown>): boolean {
  return row.publishedAt !== null;
}
