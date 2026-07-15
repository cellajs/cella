import type { Query } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { type ChannelEntityType, hierarchy } from 'shared';
import { enrichWithAncestorSlugs, type SlugIndex } from '~/query/enrichment/ancestor-slugs';
import {
  getCachedMemberships,
  getChannelEntityKeys,
  getMenuParentTypes,
  getRegisteredChannelEntities,
  isMenuParentOf,
} from '~/query/enrichment/helpers';
import { enrichWithMembership } from '~/query/enrichment/membership';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
import type { EnrichableEntity, InfiniteData } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

/** Re-entrancy guard: prevents the subscriber from reacting to its own cache writes */
let isEnriching = false;

/** Cache of extended ancestors (hierarchy + menu parents) per entity type */
const extendedAncestorsCache = new Map<ChannelEntityType, readonly ChannelEntityType[]>();

/**
 * Get ancestors including menu parent types for URL building.
 * Hierarchy ancestors come first, then menu parents not already in the list.
 * E.g. for project: ['organization'] (hierarchy) + ['workspace'] (menu parent).
 */
function getExtendedAncestors(entityType: ChannelEntityType): readonly ChannelEntityType[] {
  const cached = extendedAncestorsCache.get(entityType);
  if (cached) return cached;

  const hierarchyAncestors = hierarchy.getOrderedAncestors(entityType);
  const menuParents = getMenuParentTypes(entityType);
  if (menuParents.length === 0) {
    extendedAncestorsCache.set(entityType, hierarchyAncestors);
    return hierarchyAncestors;
  }

  const seen = new Set(hierarchyAncestors);
  const combined = [...hierarchyAncestors];
  for (const mp of menuParents) {
    if (!seen.has(mp)) combined.push(mp);
  }

  const frozen = Object.freeze(combined);
  extendedAncestorsCache.set(entityType, frozen);
  return frozen;
}

/**
 * Run all enrichers on a single item in sequence.
 * Each enricher returns the same reference when nothing changed.
 * Order matters: membership must run before permissions and ancestor-slugs (they read item.membership).
 */
function enrichItem(
  item: EnrichableEntity,
  memberships: MembershipBase[],
  entityType: ChannelEntityType,
  ancestors: readonly ChannelEntityType[],
  slugIndex: SlugIndex,
): EnrichableEntity {
  let result = enrichWithMembership(item, memberships);
  result = enrichWithPermissions(result, entityType);
  result = enrichWithAncestorSlugs(result, ancestors, slugIndex);
  return result;
}

/**
 * Enrich all items in list query data. Returns same reference when nothing changed.
 */
function enrichListData(
  data: InfiniteData,
  memberships: MembershipBase[],
  entityType: ChannelEntityType,
  slugIndex: SlugIndex,
): InfiniteData {
  const ancestors = getExtendedAncestors(entityType);
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    if (!page.items) return page;

    let pageChanged = false;
    const newItems = page.items.map((item) => {
      if (!item.id) return item;
      const enriched = enrichItem(item, memberships, entityType, ancestors, slugIndex);
      if (enriched !== item) pageChanged = true;
      return enriched;
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...page, items: newItems };
  });

  return dataChanged ? { ...data, pages: newPages } : data;
}

/** Build slug index from list queries for a given entity type */
function buildSlugIndex(entityType: string): Map<string, string> {
  const slugMap = new Map<string, string>();
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data as InfiniteData | undefined;
    if (!data?.pages) continue;
    for (const page of data.pages) {
      if (!page.items) continue;
      for (const item of page.items) {
        if (item.id && item.slug) slugMap.set(item.id, item.slug);
      }
    }
  }
  return slugMap;
}

/** Write enriched data back to the cache, guarded against re-entrancy */
function setCacheData(queryKey: Query['queryKey'], data: unknown) {
  isEnriching = true;
  try {
    queryClient.setQueryData(queryKey, data);
  } finally {
    isEnriching = false;
  }
}

/** Enrich all list and detail queries for a single entity type */
function enrichEntityType(entityType: ChannelEntityType, memberships: MembershipBase[], slugIndex: SlugIndex) {
  const cache = queryClient.getQueryCache();

  for (const query of cache.findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data as InfiniteData | undefined;
    if (!data?.pages) continue;
    const enriched = enrichListData(data, memberships, entityType, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }

  const ancestors = getExtendedAncestors(entityType);
  for (const query of cache.findAll({ queryKey: [entityType, 'detail'] })) {
    const data = (query.state.data ?? null) as EnrichableEntity | null;
    if (!data?.id) continue;
    const enriched = enrichItem(data, memberships, entityType, ancestors, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }
}

/**
 * Ensure the slug index contains entries for all ancestors of a given entity type.
 * This is needed so enrichWithAncestorSlugs can resolve ancestor slugs from the index
 * regardless of which entity type triggered the enrichment.
 */
function ensureAncestorSlugs(entityType: ChannelEntityType, slugIndex: SlugIndex) {
  for (const ancestor of getExtendedAncestors(entityType)) {
    if (!slugIndex.has(ancestor)) slugIndex.set(ancestor, buildSlugIndex(ancestor));
  }
}

/**
 * Run enrichment for a single entity type using targeted cache lookups.
 * Builds a slug index on demand from the type's own list data,
 * then enriches lists + details and any child types that depend on it for ancestor slugs.
 */
function runEnrichment(entityType: ChannelEntityType) {
  const memberships = getCachedMemberships();
  if (!memberships?.length) return;

  const slugIndex: SlugIndex = new Map([[entityType, buildSlugIndex(entityType)]]);

  // Pre-build ancestor slug indexes so enrichment can resolve ancestor slugs
  ensureAncestorSlugs(entityType, slugIndex);

  enrichEntityType(entityType, memberships, slugIndex);

  // Re-enrich child types that depend on this type for ancestor slugs
  for (const { type: childType } of getRegisteredChannelEntities()) {
    if (childType === entityType) continue;
    if (hierarchy.hasAncestor(childType, entityType) || isMenuParentOf(entityType, childType)) {
      if (!slugIndex.has(childType)) slugIndex.set(childType, buildSlugIndex(childType));
      ensureAncestorSlugs(childType, slugIndex);
      enrichEntityType(childType, memberships, slugIndex);
    }
  }
}

export function initChannelEntityEnrichment(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || isEnriching) return;

    const queryKey = event.query.queryKey;

    // Memberships updated, re-enrich all context entities.
    if (queryKey[0] === 'me' && queryKey[1] === 'memberships') {
      for (const { type } of getRegisteredChannelEntities()) {
        runEnrichment(type);
      }
      return;
    }

    // Identify the entity type from the event's query key via registry
    const entityType = typeof queryKey[0] === 'string' ? queryKey[0] : null;
    if (!entityType) return;

    const entry = getChannelEntityKeys(entityType);
    if (!entry) return;

    // Only enrich on list or detail updates
    if (queryKey[1] === 'list' || queryKey[1] === 'detail') {
      runEnrichment(entry.type);
    }
  });
}
