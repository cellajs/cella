import type { MembershipBase } from 'sdk';
import type { ChannelEntityType, EntityActionType, EntityCanMap, EntityType } from 'shared';
import { allActionsAllowed, computeCan, hierarchy, policyMatrix } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { userStore } from '~/modules/user/user-store';
import type { EnrichableChannel } from '~/query/enrichment/types';

/** Deep compare over the can states (booleans and condition names). */
function hasCanChanged(a: EntityCanMap | undefined, b: EntityCanMap | undefined): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;

  const aKeys = Object.keys(a) as EntityType[];
  const bKeys = Object.keys(b) as EntityType[];
  if (aKeys.length !== bKeys.length) return true;

  return aKeys.some((key) => {
    const aActions = a[key];
    const bActions = b[key];
    if (!aActions && !bActions) return false;
    if (!aActions || !bActions) return true;
    return (Object.keys(aActions) as EntityActionType[]).some((action) => aActions[action] !== bActions[action]);
  });
}

/** Mirrors the shape of computeCan over the channel type and its descendants, with every action allowed. */
function computeSystemAdminCan(channelType: ChannelEntityType): EntityCanMap {
  const map: EntityCanMap = { [channelType]: { ...allActionsAllowed } };
  for (const descendant of hierarchy.getOrderedDescendants(channelType)) {
    map[descendant] = { ...allActionsAllowed };
  }
  return map;
}

/** The actor's memberships on the channels above the row, found by the ancestor ids the row carries. */
function membershipsAbove(item: EnrichableChannel, channelType: ChannelEntityType, memberships: MembershipBase[]): MembershipBase[] {
  const ancestorIds = new Set(hierarchy.resolveNonNullAncestors(channelType, asRecord(item)).map(({ id }) => id));
  return memberships.filter((membership) => membership.channelId !== item.id && ancestorIds.has(membership.channelId));
}

/**
 * Permission map keyed by entity type, self plus hierarchy descendants, computed as the backend decides: from the actor's
 * membership on the row and their memberships on the channels above it. A system admin gets every action, with or without a membership.
 */
export function enrichWithPermissions(item: EnrichableChannel, channelType: ChannelEntityType, memberships: MembershipBase[]): EnrichableChannel {
  const existing = item.can;

  const grants = [...(item.membership ? [item.membership] : []), ...membershipsAbove(item, channelType, memberships)];
  const computed = userStore.getState().isSystemAdmin ? computeSystemAdminCan(channelType) : computeCan(channelType, grants, policyMatrix);

  if (!hasCanChanged(existing, computed)) return item;

  return { ...item, can: computed };
}
