import { type ChannelEntityType, hierarchy, isProduct, recordFromKeys, roles } from 'shared';

/** Shape matches `channelIncludedSchema`: { membership, entities, entitiesSelf, activity }. */
export const buildZeroCounts = (entityType: ChannelEntityType, creatorRole = 'admin') => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entities = recordFromKeys(descendants, () => 0);
  const entitiesSelf = recordFromKeys(descendants, () => 0);
  // Activity stamps stay null until a first post and a first content update.
  const activity = recordFromKeys(
    descendants.filter((descendant) => isProduct(descendant)),
    () => ({ created: null, updated: null }) as { created: number | null; updated: number | null },
  );
  const membership = {
    ...recordFromKeys(roles.all, (role) => (role === creatorRole ? 1 : 0)),
    pending: 0,
    total: 1,
  };

  return { membership, entities, entitiesSelf, activity };
};
