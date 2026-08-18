import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType, isChannel } from 'shared';
import { meKeys } from '~/modules/me/query';
import type { EntityQueryKeys } from '~/query/basic/entity-query-registry';
import { getEntityQueryKeys, getRegisteredEntityTypes } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

export function getRegisteredChannelEntities(): { type: ChannelEntityType; keys: EntityQueryKeys }[] {
  return getRegisteredEntityTypes()
    .filter((t) => isChannel(t))
    .map((t) => ({ type: t as ChannelEntityType, keys: getEntityQueryKeys(t) }));
}

/** Null when the type is not a channel entity. */
export function getChannelKeys(entityType: string): { type: ChannelEntityType; keys: EntityQueryKeys } | null {
  if (!isChannel(entityType)) return null;
  const keys = getEntityQueryKeys(entityType);
  return { type: entityType as ChannelEntityType, keys };
}

/** Null while memberships are not loaded. */
export function getCachedMemberships(): MembershipBase[] | null {
  return queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items ?? null;
}

function getMembershipEntityId(m: MembershipBase): string | null {
  return m.channelId;
}

export function findMembership(memberships: MembershipBase[], entityId: string): MembershipBase | null {
  return memberships.find((m) => getMembershipEntityId(m) === entityId) ?? null;
}

/** Channel types hosting this entity as a menu subentity, from menuStructure config, including types that are not hierarchy ancestors. */
export function getMenuParentTypes(entityType: ChannelEntityType): ChannelEntityType[] {
  return appConfig.menuStructure.filter((s) => s.subentityType === entityType).map((s) => s.entityType);
}

/** A menu parent's cache update propagates ancestor-slug re-enrichment to its children. */
export function isMenuParentOf(parentType: string, childType: string): boolean {
  return appConfig.menuStructure.some((s) => s.entityType === parentType && s.subentityType === childType);
}
