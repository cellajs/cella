import { type ContextEntityType, hierarchy } from 'config';

/**
 * Gets all ancestor context types for a given entity.
 * Delegates to hierarchy.getOrderedAncestors() which walks the parent chain.
 * Results are cached by the hierarchy instance.
 *
 * @param entityType - The entity type to get ancestors for.
 * @returns Array of ancestor context types in order (most-specific → root).
 */
export const getAncestorContexts = (entityType: string): ContextEntityType[] => {
  return [...hierarchy.getOrderedAncestors(entityType)] as ContextEntityType[];
};
