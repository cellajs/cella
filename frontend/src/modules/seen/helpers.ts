import { hierarchy, type ProductEntityType } from 'shared';

export const seenKeys = { unseenCounts: ['me', 'unseen', 'counts'] };

/**
 * Grouping channel for a row: its deepest non-null ancestor, matching mark-seen, unseen counts and unseen-sync.
 * @public
 */
export const getSeenChannelId = (entityType: ProductEntityType, entity: Record<string, unknown> & { organizationId: string }): string =>
  hierarchy.resolveDeepestAncestorId(entityType, entity) ?? entity.organizationId;

/** Mirrors the server's unseen exclusions (unpublished drafts included); app feed filters belong here too. */
export const matchesUnseenFilters = (_entityType: ProductEntityType, row: Record<string, unknown>): boolean => row.publishedAt !== null;
