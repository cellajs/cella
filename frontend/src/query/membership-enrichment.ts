import type { Query } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { MembershipBase } from '~/api.gen';
import { meKeys } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';

/** Entity types that should be enriched with membership data */
const enrichableEntityTypes = ['organization'] as const;

/** Check if a query key is for an enrichable entity list */
function isEnrichableListQuery(queryKey: readonly unknown[]): boolean {
  if (queryKey.length < 2) return false;
  const [entityType, queryType] = queryKey;
  return (
    typeof entityType === 'string' &&
    enrichableEntityTypes.includes(entityType as (typeof enrichableEntityTypes)[number]) &&
    queryType === 'list'
  );
}

/** Get membership for an entity from the memberships cache */
function getMembershipForEntity(entityId: string): MembershipBase | undefined {
  const membershipsData = queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships);
  if (!membershipsData?.items) return undefined;

  return membershipsData.items.find((m) => m.organizationId === entityId);
}

/**
 * Hook to get membership for an entity from the memberships cache.
 * Subscribes to cache changes and returns the membership for the given entity.
 */
export function useMembershipForEntity(entityId: string | undefined): MembershipBase | undefined {
  const membershipsData = useSyncExternalStore(
    (callback) => {
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] === 'me' && event.query.queryKey[1] === 'memberships') {
          callback();
        }
      });
      return unsubscribe;
    },
    () => queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships),
  );

  if (!entityId || !membershipsData?.items) return undefined;
  return membershipsData.items.find((m) => m.organizationId === entityId);
}

/** Enrich a single entity with its membership */
function enrichEntityWithMembership<T extends { id: string; membership?: MembershipBase | null }>(entity: T): T {
  const membership = getMembershipForEntity(entity.id);
  if (!membership) return entity;
  return { ...entity, membership };
}

/** Enrich entities in infinite query data */
function enrichInfiniteData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { pages?: unknown[] };
  if (!d.pages) return data;

  return {
    ...d,
    pages: d.pages.map((page: unknown) => {
      if (!page || typeof page !== 'object') return page;
      const p = page as { items?: unknown[] };
      if (!p.items) return page;
      return {
        ...p,
        items: p.items.map((item) => {
          if (!item || typeof item !== 'object' || !('id' in item)) return item;
          return enrichEntityWithMembership(item as { id: string; membership?: MembershipBase | null });
        }),
      };
    }),
  };
}

/** Deep compare two membership objects to check if they have meaningful differences */
function hasMembershipChanged(
  oldMembership: MembershipBase | null | undefined,
  newMembership: MembershipBase | null | undefined,
): boolean {
  if (!oldMembership && !newMembership) return false;
  if (!oldMembership || !newMembership) return true;

  return (
    oldMembership.archived !== newMembership.archived ||
    oldMembership.muted !== newMembership.muted ||
    oldMembership.displayOrder !== newMembership.displayOrder ||
    oldMembership.role !== newMembership.role
  );
}

/** Check if enrichment would actually change any data */
function wouldEnrichmentChangeData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as { pages?: unknown[] };
  if (!d.pages) return false;

  for (const page of d.pages) {
    if (!page || typeof page !== 'object') continue;
    const p = page as { items?: unknown[] };
    if (!p.items) continue;

    for (const item of p.items) {
      if (!item || typeof item !== 'object' || !('id' in item)) continue;
      const entity = item as { id: string; membership?: MembershipBase | null };
      const newMembership = getMembershipForEntity(entity.id);

      if (hasMembershipChanged(entity.membership, newMembership)) {
        return true;
      }
    }
  }

  return false;
}

/** Flag to prevent re-entrancy during enrichment */
let isEnriching = false;

/** Store previous memberships state to detect actual changes */
let previousMembershipsState: Map<string, MembershipBase> = new Map();

/** Check if memberships actually changed and update stored state */
function detectMembershipChanges(currentMemberships: MembershipBase[]): Set<string> {
  const changedEntityTypes = new Set<string>();
  const currentState = new Map<string, MembershipBase>();

  for (const membership of currentMemberships) {
    const entityId = membership.organizationId || membership.id;
    currentState.set(entityId, membership);

    const previous = previousMembershipsState.get(entityId);
    if (hasMembershipChanged(previous, membership)) {
      if (membership.organizationId) {
        changedEntityTypes.add('organization');
      }
    }
  }

  previousMembershipsState = currentState;
  return changedEntityTypes;
}

/** Re-enrich entity list queries for specific entity types */
function reEnrichEntityLists(entityTypes?: Set<string>): void {
  if (isEnriching) return;

  const membershipsData = queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships);
  if (!membershipsData?.items?.length) return;

  const changedTypes = entityTypes || detectMembershipChanges(membershipsData.items);
  if (changedTypes.size === 0) return;

  const queries = queryClient.getQueryCache().getAll();

  for (const query of queries) {
    const queryKey = query.queryKey;

    if (!isEnrichableListQuery(queryKey)) continue;

    if (entityTypes) {
      const queryEntityType = queryKey[0] as string;
      if (!entityTypes.has(queryEntityType)) continue;
    }

    const data = query.state.data;
    if (!data) continue;

    if (!wouldEnrichmentChangeData(data)) continue;

    const enrichedData = enrichInfiniteData(data);
    if (enrichedData === data) continue;

    isEnriching = true;
    try {
      queryClient.setQueryData(queryKey, enrichedData);
    } finally {
      isEnriching = false;
    }
  }
}

/**
 * Subscribe to query cache to auto-enrich context entities with membership data.
 * Call this once during app initialization.
 */
export function setupMembershipEnrichment(): () => void {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // Only handle successful query updates
    if (event.type !== 'updated' || isEnriching) return;

    const query = event.query as Query;
    const queryKey = query.queryKey;

    // When myMemberships is updated, only re-enrich affected entity types
    if (queryKey[0] === 'me' && queryKey[1] === 'memberships') {
      reEnrichEntityLists();
      return;
    }

    // Skip non-enrichable queries
    if (!isEnrichableListQuery(queryKey)) return;

    // Check if memberships are loaded
    const membershipsData = queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships);
    if (!membershipsData?.items?.length) return;

    const data = query.state.data;
    if (!data) return;

    // Enrich the data
    const enrichedData = enrichInfiniteData(data);

    // Check if enrichment actually changed anything (simple reference check)
    if (enrichedData === data) return;

    // Set enriched data (with guard to prevent re-entry)
    isEnriching = true;
    try {
      queryClient.setQueryData(queryKey, enrichedData);
    } finally {
      isEnriching = false;
    }
  });

  return unsubscribe;
}
