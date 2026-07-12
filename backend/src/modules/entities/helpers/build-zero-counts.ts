import { type ContextEntityType, hierarchy, recordFromKeys, roles } from 'shared';

/**
 * Build a zero-initialized counts response object for a new context entity.
 * Used in create responses where the entity has no prior data.
 *
 * @param entityType - The context entity type (e.g. 'organization')
 * @param creatorRole - The role assigned to the creator (defaults to 'admin')
 * @returns Object matching contextEntityIncludedSchema counts: { membership: {...}, entities: {...}, activity: {...} }
 */
export const buildZeroCounts = (entityType: ContextEntityType, creatorRole = 'admin') => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entities = recordFromKeys(descendants, () => 0);
  // Activity stamps stay null until the first post lands in the entity's stream
  const activity = recordFromKeys(
    descendants.filter((descendant) => hierarchy.isProduct(descendant)),
    () => null as number | null,
  );
  const membership = {
    ...recordFromKeys(roles.all, (role) => (role === creatorRole ? 1 : 0)),
    pending: 0,
    total: 1,
  };

  return { membership, entities, activity };
};
