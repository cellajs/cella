import { type ChannelEntityType, type EntityRole, hierarchy, isProduct, recordFromKeys, roles } from 'shared';

/**
 * The counts of a channel its creator just made, in the shape of `channelIncludedSchema`.
 * @param entityType - The channel type created.
 * @param creatorRole - The role the creator's membership was inserted with: the one member the counts hold.
 */
export const buildZeroCounts = (entityType: ChannelEntityType, creatorRole: EntityRole) => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entities = recordFromKeys(descendants, () => 0);
  const entitiesSelf = recordFromKeys(descendants, () => 0);
  // Activity stamps stay null until a first post and a first content update.
  const activity = recordFromKeys(
    descendants.filter((descendant) => isProduct(descendant)),
    () => ({ created: null, updated: null }) as { created: number | null; updated: number | null },
  );
  const membership = { ...recordFromKeys(roles.all, (role) => (role === creatorRole ? 1 : 0)), pending: 0, total: 1 };

  return { membership, entities, entitiesSelf, activity };
};
