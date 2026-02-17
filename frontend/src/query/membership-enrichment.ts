import type { Query } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { appConfig, hierarchy } from 'shared';
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
  slug?: string;
  membership?: MembershipBase | null;
  ancestorSlugs?: Record<string, string>;
}

/** Infinite query data shape: pages of items */
interface InfiniteData {
  pages: { items: EnrichableEntity[] }[];
}

/**
 * Find a context entity's slug by searching list caches for that entity type.
 * Scans all list queries for the given entity type to find the slug by ID.
 */
function findEntitySlugInCache(entityType: string, entityId: string): string | undefined {
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.queryKey[0] !== entityType || query.queryKey[1] !== 'list') continue;
    const data = query.state.data as InfiniteData | undefined;
    if (!data?.pages) continue;
    for (const page of data.pages) {
      const found = page.items?.find((item) => item.id === entityId);
      if (found?.slug) return found.slug;
    }
  }
  return undefined;
}

/**
 * Build ancestor slugs map for an entity using the hierarchy config.
 * Walks up the ancestor chain, resolving each ancestor's slug from its list cache.
 * Falls back to the ancestor ID when slug isn't cached — this ensures route params
 * are always populated, and rewriteUrlToSlug in beforeLoad corrects the URL.
 */
function buildAncestorSlugs(
  item: EnrichableEntity,
  membership: MembershipBase | null | undefined,
  ancestors: readonly string[],
): Record<string, string> | undefined {
  if (ancestors.length === 0) return undefined;

  const slugs: Record<string, string> = {};
  let found = false;

  for (const ancestorType of ancestors) {
    const idKey = (appConfig.entityIdColumnKeys as Record<string, string>)[ancestorType];
    if (!idKey) continue;
    // Try getting ancestor ID from membership first, then entity itself
    const ancestorId =
      (membership as unknown as Record<string, unknown>)?.[idKey] ??
      (item as unknown as Record<string, unknown>)[idKey];
    if (typeof ancestorId !== 'string') continue;

    // Prefer slug from cache, fall back to ID so route params are always populated
    const slug = findEntitySlugInCache(ancestorType, ancestorId) ?? ancestorId;
    slugs[ancestorType] = slug;
    found = true;
  }

  return found ? slugs : undefined;
}

/** Check if ancestor slugs maps differ */
function hasAncestorSlugsChanged(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return true;
  return aKeys.some((k) => a[k] !== b[k]);
}

/**
 * Enrich infinite query data with memberships and ancestor slugs in a single pass.
 * Returns the same reference when nothing changed (avoids unnecessary re-renders).
 */
function enrichInfiniteData(data: InfiniteData, memberships: MembershipBase[], entityType: string): InfiniteData {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    if (!page.items) return page;

    let pageChanged = false;
    const newItems = page.items.map((item) => {
      if (!item.id) return item;

      // Look up from memberships cache, fallback to included.membership on the entity itself
      const membership = findMembership(memberships, item.id) ?? (item as any).included?.membership;
      const membershipChanged = membership && hasMembershipChanged(item.membership, membership);

      // Build ancestor slugs from hierarchy
      const newAncestorSlugs = buildAncestorSlugs(item, membership ?? item.membership, ancestors);
      const ancestorSlugsChanged = hasAncestorSlugsChanged(item.ancestorSlugs, newAncestorSlugs);

      if (!membershipChanged && !ancestorSlugsChanged) return item;

      pageChanged = true;
      return {
        ...item,
        ...(membershipChanged && { membership }),
        ...(ancestorSlugsChanged && { ancestorSlugs: newAncestorSlugs }),
      };
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...page, items: newItems };
  });

  return dataChanged ? { ...data, pages: newPages } : data;
}

/** Flag to prevent re-entrancy during enrichment */
let isEnriching = false;

/** Enrich a query's data with memberships and ancestor slugs if anything changed */
function enrichQuery(query: Query, memberships: MembershipBase[]): void {
  const data = query.state.data as InfiniteData | undefined;
  if (!data?.pages) return;

  const entityType = query.queryKey[0] as string;
  const enriched = enrichInfiniteData(data, memberships, entityType);
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
 * It enriches queries with membership data and ancestor slugs from the cache
 * whenever memberships or relevant queries update.
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

    // When an enrichable list query updates, enrich it and re-enrich child entity lists
    if (isEnrichableListQuery(queryKey) && memberships?.length) {
      enrichQuery(query, memberships);

      // Re-enrich child entity lists whose ancestors include this entity type
      // (e.g., when organizations load, re-enrich projects/workspaces that need orgSlug)
      const updatedType = queryKey[0] as string;
      for (const q of queryClient.getQueryCache().getAll()) {
        if (q === query || !isEnrichableListQuery(q.queryKey)) continue;
        const childType = q.queryKey[0] as string;
        if (hierarchy.hasAncestor(childType, updatedType)) {
          enrichQuery(q as Query, memberships);
        }
      }
    }
  });
}
