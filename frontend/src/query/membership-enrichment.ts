import type { Query } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { MembershipBase } from '~/api.gen';
import { meKeys } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';

/** Entity types that should be enriched with membership data */
const enrichableEntityTypes = ['organization', 'workspace', 'project'] as const;

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

/** Get cached memberships array, or undefined if not loaded */
function getCachedMemberships(): MembershipBase[] | undefined {
  return queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items;
}

/** Find a membership matching an entity id */
function findMembership(memberships: MembershipBase[], entityId: string): MembershipBase | undefined {
  return memberships.find((m) => m.organizationId === entityId);
}

/**
 * Hook to get membership for an entity from the memberships cache.
 * Subscribes to cache changes and returns the membership for the given entity.
 */
export function useMembershipForEntity(entityId: string | undefined): MembershipBase | undefined {
  const memberships = useSyncExternalStore(
    (callback) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] === 'me' && event.query.queryKey[1] === 'memberships') callback();
      }),
    getCachedMemberships,
  );

  if (!entityId || !memberships) return undefined;
  return findMembership(memberships, entityId);
}

/** Fields that affect enrichment — update when MembershipBase gains new meaningful fields */
const comparedKeys: (keyof MembershipBase)[] = ['archived', 'muted', 'displayOrder', 'role'];

/** Check if two memberships differ on meaningful fields */
function hasMembershipChanged(a: MembershipBase | null | undefined, b: MembershipBase | null | undefined): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return comparedKeys.some((k) => a[k] !== b[k]);
}

/**
 * Enrich infinite query data with memberships in a single pass.
 * Returns the same reference when nothing changed (avoids unnecessary re-renders).
 */
function enrichInfiniteData(data: unknown, memberships: MembershipBase[]): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { pages?: unknown[] };
  if (!d.pages) return data;

  let dataChanged = false;
  const newPages = d.pages.map((page: unknown) => {
    if (!page || typeof page !== 'object') return page;
    const p = page as { items?: unknown[] };
    if (!p.items) return page;

    let pageChanged = false;
    const newItems = p.items.map((item) => {
      if (!item || typeof item !== 'object' || !('id' in item)) return item;
      const entity = item as { id: string; membership?: MembershipBase | null };
      const membership = findMembership(memberships, entity.id);
      if (!membership || !hasMembershipChanged(entity.membership, membership)) return item;
      pageChanged = true;
      return { ...entity, membership };
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...p, items: newItems };
  });

  return dataChanged ? { ...d, pages: newPages } : data;
}

/** Flag to prevent re-entrancy during enrichment */
let isEnriching = false;

/** Enrich a query's data with memberships if anything changed */
function enrichQuery(query: Query, memberships: MembershipBase[]): void {
  const data = query.state.data;
  if (!data) return;

  const enriched = enrichInfiniteData(data, memberships);
  if (enriched === data) return;

  isEnriching = true;
  try {
    queryClient.setQueryData(query.queryKey, enriched);
  } finally {
    isEnriching = false;
  }
}

/**
 * Subscribe to query cache to auto-enrich context entities with membership data.
 * Call this once during app initialization.
 */
export function setupMembershipEnrichment(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || isEnriching) return;

    const query = event.query as Query;
    const queryKey = query.queryKey;
    const memberships = getCachedMemberships();

    // When memberships update, re-enrich all enrichable list queries
    if (queryKey[0] === 'me' && queryKey[1] === 'memberships') {
      if (!memberships?.length) return;
      for (const q of queryClient.getQueryCache().getAll()) {
        if (isEnrichableListQuery(q.queryKey)) enrichQuery(q as Query, memberships);
      }
      return;
    }

    // When an enrichable list query updates, enrich it
    if (isEnrichableListQuery(queryKey) && memberships?.length) {
      enrichQuery(query, memberships);
    }
  });
}
