import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType, isChannel } from 'shared';
import { meKeys } from '~/modules/me/query';
import { getRegisteredEntityTypes } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

export const getRegisteredChannelTypes = (): ChannelEntityType[] => getRegisteredEntityTypes().filter(isChannel);

/** Null while memberships are not loaded. */
export const getCachedMemberships = (): MembershipBase[] | null =>
  queryClient.getQueryData<{ results: MembershipBase[] }>(meKeys.memberships)?.results ?? null;

export const findMembership = (memberships: MembershipBase[], entityId: string): MembershipBase | null =>
  memberships.find((membership) => membership.channelId === entityId) ?? null;

/** Channel types hosting this entity as a menu subentity, from menuStructure config, including types that are not hierarchy ancestors. */
export const getMenuParentTypes = (entityType: ChannelEntityType): ChannelEntityType[] =>
  appConfig.menuStructure.filter((menuItem) => menuItem.subentityType === entityType).map((menuItem) => menuItem.entityType);

/** A menu parent's cache update propagates ancestor-slug re-enrichment to its children. */
export const isMenuParentOf = (parentType: ChannelEntityType, childType: ChannelEntityType): boolean =>
  appConfig.menuStructure.some((menuItem) => menuItem.entityType === parentType && menuItem.subentityType === childType);
