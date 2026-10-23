import type { GetMyInvitationsResponse, MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType, isChannel } from 'shared';
import { meKeys } from '~/modules/me/query';
import { getRegisteredEntityTypes } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

export function getRegisteredChannelTypes(): ChannelEntityType[] {
  return getRegisteredEntityTypes().filter(isChannel);
}

/** Null while memberships are not loaded. */
export function getCachedMemberships(): MembershipBase[] | null {
  return queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items ?? null;
}

/** Ids of the channels the viewer holds an unanswered invitation to; null while the invites list is not loaded. */
export function getCachedInvitedIds(): ReadonlySet<string> | null {
  const invites = queryClient.getQueryData<GetMyInvitationsResponse>(meKeys.invites);
  return invites ? new Set(invites.items.map(({ entity }) => entity.id)) : null;
}

function getMembershipEntityId(membership: MembershipBase): string | null {
  return membership.channelId;
}

export function findMembership(memberships: MembershipBase[], entityId: string): MembershipBase | null {
  return memberships.find((membership) => getMembershipEntityId(membership) === entityId) ?? null;
}

/** Channel types hosting this entity as a menu subentity, from menuStructure config, including types that are not hierarchy ancestors. */
export function getMenuParentTypes(entityType: ChannelEntityType): ChannelEntityType[] {
  return appConfig.menuStructure.filter((menuItem) => menuItem.subentityType === entityType).map((menuItem) => menuItem.entityType);
}

/** A menu parent's cache update propagates ancestor-slug re-enrichment to its children. */
export function isMenuParentOf(parentType: string, childType: string): boolean {
  return appConfig.menuStructure.some((menuItem) => menuItem.entityType === parentType && menuItem.subentityType === childType);
}
