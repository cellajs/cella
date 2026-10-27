import { type ChannelEntityType, type EntityRole, hierarchy, isProduct, recordFromKeys, roles } from 'shared';

/** The counts of a channel nothing has been counted for yet, in the shape of `channelIncludedSchema`. */
export const zeroChannelCounts = (entityType: ChannelEntityType) => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  return {
    membership: { ...recordFromKeys(roles.all, () => 0), pending: 0, total: 0 },
    entities: recordFromKeys(descendants, () => 0),
    entitiesSelf: recordFromKeys(descendants, () => 0),
    activity: recordFromKeys(
      descendants.filter((descendant) => isProduct(descendant)),
      (): { created: number | null; updated: number | null } => ({ created: null, updated: null }),
    ),
  };
};

/**
 * The counts of a channel its creator just made, in the shape of `channelIncludedSchema`.
 * @param entityType - The channel type created.
 * @param creatorRole - The role the creator's membership was inserted with: the one member the counts hold.
 */
export const buildZeroCounts = (entityType: ChannelEntityType, creatorRole: EntityRole) => {
  const counts = zeroChannelCounts(entityType);
  return { ...counts, membership: { ...counts.membership, [creatorRole]: 1, total: 1 } };
};
