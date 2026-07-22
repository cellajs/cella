import type { ChannelEntityType, EntityActionType, EntityCanMap, EntityType } from 'shared';
import { accessPolicies, allActionsAllowed, computeCan, hierarchy } from 'shared';
import { useUserStore } from '~/modules/user/user-store';
import type { EnrichableChannel } from '~/query/enrichment/types';

/** Deep-compare two EntityCanMap objects (supports three-state: true/false/'own') */
function hasCanChanged(a: EntityCanMap | undefined, b: EntityCanMap | undefined): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;

  const aKeys = Object.keys(a) as EntityType[];
  const bKeys = Object.keys(b) as EntityType[];
  if (aKeys.length !== bKeys.length) return true;

  return aKeys.some((key) => {
    const aPerms = a[key];
    const bPerms = b[key];
    if (!aPerms && !bPerms) return false;
    if (!aPerms || !bPerms) return true;
    return (Object.keys(aPerms) as EntityActionType[]).some((action) => aPerms[action] !== bPerms[action]);
  });
}

/**
 * Build an all-actions-allowed permission map for system admins.
 * Mirrors the structure of computeCan (channel type + descendants) but with full permissions.
 */
function computeSystemAdminCan(channelType: ChannelEntityType): EntityCanMap {
  const map: EntityCanMap = { [channelType]: { ...allActionsAllowed } };
  for (const descendant of hierarchy.getOrderedDescendants(channelType)) {
    map[descendant] = { ...allActionsAllowed };
  }
  return map;
}

/**
 * Enrich an item with a permission map (keyed by entity type: self + hierarchy descendants) computed
 * from its membership. System admins without a membership get full permissions, mirroring the backend.
 * Returns the original reference when nothing changed.
 */
export function enrichWithPermissions(item: EnrichableChannel, channelType: ChannelEntityType): EnrichableChannel {
  const membership = item.membership ?? null;
  const existing = item.can;

  const isSystemAdmin = useUserStore.getState().isSystemAdmin;
  const computed = membership
    ? computeCan(channelType, membership, accessPolicies)
    : isSystemAdmin
      ? computeSystemAdminCan(channelType)
      : {};

  if (!hasCanChanged(existing, computed)) return item;

  return { ...item, can: computed };
}
