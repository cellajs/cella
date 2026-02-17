import type { Query } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { appConfig } from 'shared';
import type { MembershipBase } from '~/api.gen';
import { meKeys } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';

/** Set of context entity types for O(1) lookup */
const enrichableEntityTypes = new Set<string>(appConfig.contextEntityTypes);

/** Check if a query key is for an enrichable context entity list */
function isEnrichableListQuery(queryKey: readonly unknown[]): boolean {
  if (queryKey.length < 2) return false;
  return enrichableEntityTypes.has(queryKey[0] as string) && queryKey[1] === 'list';
}

/** Get cached memberships array, or undefined if not loaded */
function getCachedMemberships(): MembershipBase[] | undefined {
  return queryClient.getQueryData<{ items: MembershipBase[] }>(meKeys.memberships)?.items;
}

/** Get the entity ID a membership belongs to, using entityIdColumnKeys from config */
function getMembershipEntityId(m: MembershipBase): string | null {
  const idKey = appConfig.entityIdColumnKeys[m.contextType];
  return m[idKey];
}

/** Find a membership matching an entity id */
function findMembership(memberships: MembershipBase[], entityId: string): MembershipBase | undefined {
  return memberships.find((m) => getMembershipEntityId(m) === entityId);
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

/** Entity shape expected in infinite query pages */
interface EnrichableEntity {
  id: string;
  membership?: MembershipBase | null;
}

/** Infinite query data shape: pages of items */
interface InfiniteData {
  pages: { items: EnrichableEntity[] }[];
}

/**
 * Enrich infinite query data with memberships in a single pass.
 * Returns the same reference when nothing changed (avoids unnecessary re-renders).
 */
function enrichInfiniteData(data: InfiniteData, memberships: MembershipBase[]): InfiniteData {
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    if (!page.items) return page;

    let pageChanged = false;
    const newItems = page.items.map((item) => {
      if (!item.id) return item;
      const membership = findMembership(memberships, item.id);
      if (!membership || !hasMembershipChanged(item.membership, membership)) return item;
      pageChanged = true;
      return { ...item, membership };
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...page, items: newItems };
  });

  return dataChanged ? { ...data, pages: newPages } : data;
}

/** Flag to prevent re-entrancy during enrichment */
let isEnriching = false;

/** Enrich a query's data with memberships if anything changed */
function enrichQuery(query: Query, memberships: MembershipBase[]): void {
  const data = query.state.data as InfiniteData | undefined;
  if (!data?.pages) return;

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
 * Subscribe to query cache to auto-enrich context entities.
 * Call this once during app initialization.
 * It enriches queries with membership data from the cache whenever memberships or relevant queries update.
 */
export function initContextEntityEnrichment(): () => void {
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
