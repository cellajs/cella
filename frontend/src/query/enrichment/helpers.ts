import { appConfig, type ContextEntityType, hierarchy } from 'shared';
import type { MembershipBase } from '~/api.gen';
import { meKeys } from '~/modules/me/query';
import { type EntityQueryKeys, getEntityQueryKeys, getRegisteredEntityTypes } from '~/query/basic';
import { queryClient } from '~/query/query-client';

/** Safely access a dynamic key on an object with varying shapes */
// biome-ignore lint/suspicious/noExplicitAny: dynamic key access on objects with varying shapes
export function getField(obj: any, key: string): unknown {
  return obj?.[key];
}

/** Get all registered context entity types with their query keys */
export function getRegisteredContextEntities(): { type: ContextEntityType; keys: EntityQueryKeys }[] {
  return getRegisteredEntityTypes()
    .filter((t) => hierarchy.isContext(t))
    .map((t) => ({ type: t as ContextEntityType, keys: getEntityQueryKeys(t)! }));
}

/** Get registered query keys for a context entity type, or null if not registered */
export function getContextEntityKeys(entityType: string): { type: ContextEntityType; keys: EntityQueryKeys } | null {
  if (!hierarchy.isContext(entityType)) return null;
  const keys = getEntityQueryKeys(entityType);
  if (!keys) return null;
  return { type: entityType as ContextEntityType, keys };
}

/** Get cached memberships array, or null if not loaded */
export function getCachedMemberships(): MembershipBase[] | null {
  return queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items ?? null;
}

/** Get the entity ID a membership belongs to */
export function getMembershipEntityId(m: MembershipBase): string | null {
  return m[appConfig.entityIdColumnKeys[m.contextType]];
}

/** Find the membership for a given entity ID */
export function findMembership(memberships: MembershipBase[], entityId: string): MembershipBase | undefined {
  return memberships.find((m) => getMembershipEntityId(m) === entityId);
}
