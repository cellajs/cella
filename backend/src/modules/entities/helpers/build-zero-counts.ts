import { type ContextEntityType, hierarchy, recordFromKeys, roles } from 'shared';

/**
 * Build a zero-initialized counts response object for a new context entity.
 * Used in create responses where the entity has no prior data.
 *
 * @param entityType - The context entity type (e.g. 'organization')
 * @param creatorRole - The role assigned to the creator (defaults to 'admin')
 * @returns Object matching fullCountsSchema: { membership: {...}, entities: {...} }
 */
export const buildZeroCounts = (entityType: ContextEntityType, creatorRole: string = 'admin') => {
  const entities = recordFromKeys(hierarchy.getChildren(entityType), () => 0);
  const membership = {
    ...recordFromKeys(roles.all, (role) => (role === creatorRole ? 1 : 0)),
    pending: 0,
    total: 1,
  };

  return { membership, entities };
};
