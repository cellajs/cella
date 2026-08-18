import type { Query } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { type ChannelEntityType, hierarchy } from 'shared';
import { enrichWithAncestorSlugs, type SlugIndex } from '~/query/enrichment/ancestor-slugs';
import {
  getCachedMemberships,
  getChannelKeys,
  getMenuParentTypes,
  getRegisteredChannelEntities,
  isMenuParentOf,
} from '~/query/enrichment/helpers';
import { enrichWithMembership } from '~/query/enrichment/membership';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
import type { EnrichableChannel, InfiniteData } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

/** Re-entrancy guard: prevents the subscriber from reacting to its own cache writes */
let isEnriching = false;

/** Hierarchy ancestors plus menu parents, per entity type. */
const extendedAncestorsCache = new Map<ChannelEntityType, readonly ChannelEntityType[]>();

/** Ancestors for URL building: hierarchy ancestors first, then menu parents not already included. */
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

/** Order matters: membership runs first, since permissions and ancestor-slugs read item.membership. Each enricher returns the same reference when unchanged. */
function enrichItem(
  item: EnrichableChannel,
  memberships: MembershipBase[],
  entityType: ChannelEntityType,
  ancestors: readonly ChannelEntityType[],
  slugIndex: SlugIndex,
): EnrichableChannel {
  let result = enrichWithMembership(item, memberships);
  result = enrichWithPermissions(result, entityType);
  result = enrichWithAncestorSlugs(result, ancestors, slugIndex);
  return result;
}

/** Returns the same reference when nothing changed. */
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

function buildSlugIndex(entityType: ChannelEntityType): Map<string, string> {
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

/** Sets isEnriching so the cache subscriber ignores this write. */
function setCacheData(queryKey: Query['queryKey'], data: unknown) {
  isEnriching = true;
  try {
    queryClient.setQueryData(queryKey, data);
  } finally {
    isEnriching = false;
  }
}

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
    const data = (query.state.data ?? null) as EnrichableChannel | null;
    if (!data?.id) continue;
    const enriched = enrichItem(data, memberships, entityType, ancestors, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }
}

/** Indexes every ancestor of this entity type, so enrichWithAncestorSlugs resolves slugs whichever type triggered enrichment. */
function ensureAncestorSlugs(entityType: ChannelEntityType, slugIndex: SlugIndex) {
  for (const ancestor of getExtendedAncestors(entityType)) {
    if (!slugIndex.has(ancestor)) slugIndex.set(ancestor, buildSlugIndex(ancestor));
  }
}

/** Enrich one entity type: build its slug index on demand, then enrich its lists, details, and dependent child types. */
function runEnrichment(entityType: ChannelEntityType) {
  const memberships = getCachedMemberships();
  if (!memberships?.length) return;

  const slugIndex: SlugIndex = new Map([[entityType, buildSlugIndex(entityType)]]);

  ensureAncestorSlugs(entityType, slugIndex);

  enrichEntityType(entityType, memberships, slugIndex);

  // Child types read this type's slugs as ancestors, so they re-enrich too.
  for (const { type: childType } of getRegisteredChannelEntities()) {
    if (childType === entityType) continue;
    if (hierarchy.hasAncestor(childType, entityType) || isMenuParentOf(entityType, childType)) {
      if (!slugIndex.has(childType)) slugIndex.set(childType, buildSlugIndex(childType));
      ensureAncestorSlugs(childType, slugIndex);
      enrichEntityType(childType, memberships, slugIndex);
    }
  }
}

/** Initializes cache enrichment for channel entities and memberships. */
export function initChannelEnrichment(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || isEnriching) return;

    const queryKey = event.query.queryKey;

    // A membership change affects every channel entity.
    if (queryKey[0] === 'me' && queryKey[1] === 'memberships') {
      for (const { type } of getRegisteredChannelEntities()) {
        runEnrichment(type);
      }
      return;
    }

    const entityType = typeof queryKey[0] === 'string' ? queryKey[0] : null;
    if (!entityType) return;

    const entry = getChannelKeys(entityType);
    if (!entry) return;

    if (queryKey[1] === 'list' || queryKey[1] === 'detail') {
      runEnrichment(entry.type);
    }
  });
}
