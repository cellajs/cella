import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { meKeys } from '~/modules/me/query';
import {
  type EntityQueryKeys,
  getEntityQueryKeys,
  getRegisteredEntityTypes,
} from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

/** Get all registered channel entity types with their query keys */
export function getRegisteredChannelEntities(): { type: ChannelEntityType; keys: EntityQueryKeys }[] {
  return getRegisteredEntityTypes()
    .filter((t) => hierarchy.isChannel(t))
    .map((t) => ({ type: t as ChannelEntityType, keys: getEntityQueryKeys(t) }));
}

/** Get registered query keys for a channel entity type, or null if not registered */
export function getChannelEntityKeys(entityType: string): { type: ChannelEntityType; keys: EntityQueryKeys } | null {
  if (!hierarchy.isChannel(entityType)) return null;
  const keys = getEntityQueryKeys(entityType);
  return { type: entityType as ChannelEntityType, keys };
}

/** Get cached memberships array, or null if not loaded */
export function getCachedMemberships(): MembershipBase[] | null {
  return queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items ?? null;
}

/** Get the entity ID a membership belongs to */
function getMembershipEntityId(m: MembershipBase): string | null {
  return m.channelId;
}

/** Find the membership for a given entity ID, or null if none matches */
export function findMembership(memberships: MembershipBase[], entityId: string): MembershipBase | null {
  return memberships.find((m) => getMembershipEntityId(m) === entityId) ?? null;
}

/**
 * Get menu parent types for a given entity type from menuStructure config.
 * These are channel entity types that host this entity as a subentity in the menu,
 * even if they aren't hierarchy ancestors (e.g. workspace hosts project).
 */
export function getMenuParentTypes(entityType: string): ChannelEntityType[] {
  return appConfig.menuStructure.filter((s) => s.subentityType === entityType).map((s) => s.entityType);
}

/**
 * Check if a channel entity type is a menu parent of another.
 * Propagates ancestor slug re-enrichment when a menu parent's cache updates.
 */
export function isMenuParentOf(parentType: string, childType: string): boolean {
  return appConfig.menuStructure.some((s) => s.entityType === parentType && s.subentityType === childType);
}
