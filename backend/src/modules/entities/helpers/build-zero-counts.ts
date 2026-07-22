import { type ChannelEntityType, hierarchy, recordFromKeys, roles } from 'shared';

/**
 * Zero-initialized counts for a newly created channel entity (create responses, no prior data).
 * Shape matches `channelIncludedSchema`: { membership, entities, activity }.
 */
export const buildZeroCounts = (entityType: ChannelEntityType, creatorRole = 'admin') => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entities = recordFromKeys(descendants, () => 0);
  // Activity stamps stay null until the first post (created) / first content update (updated)
  const activity = recordFromKeys(
    descendants.filter((descendant) => hierarchy.isProduct(descendant)),
    () => ({ created: null, updated: null }) as { created: number | null; updated: number | null },
  );
  const membership = {
    ...recordFromKeys(roles.all, (role) => (role === creatorRole ? 1 : 0)),
    pending: 0,
    total: 1,
  };

  return { membership, entities, activity };
};
