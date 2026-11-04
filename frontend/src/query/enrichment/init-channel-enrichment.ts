import type { Query } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { type ChannelEntityType, hierarchy, isChannel } from 'shared';
import { writeKeepingMark } from '~/query/basic/cache-mutations';
import { enrichWithAncestorSlugs, type SlugIndex } from '~/query/enrichment/ancestor-slugs';
import { getCachedMemberships, getMenuParentTypes, getRegisteredChannelTypes, isMenuParentOf } from '~/query/enrichment/helpers';
import type { EnrichableChannel, EnrichableListData } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

/** Re-entrancy guard: keeps the subscriber from reacting to its own cache writes. */
let isEnriching = false;

const extendedAncestorsCache = new Map<ChannelEntityType, readonly ChannelEntityType[]>();

/** Ancestors for URL building: hierarchy ancestors first, then menu parents not already included. */
function getExtendedAncestors(entityType: ChannelEntityType): readonly ChannelEntityType[] {
  let ancestors = extendedAncestorsCache.get(entityType);
  if (!ancestors) {
    ancestors = [...new Set([...hierarchy.getOrderedAncestors(entityType), ...getMenuParentTypes(entityType)])];
    extendedAncestorsCache.set(entityType, ancestors);
  }
  return ancestors;
}

function enrichListData(
  data: EnrichableListData,
  memberships: MembershipBase[],
  entityType: ChannelEntityType,
  slugIndex: SlugIndex,
): EnrichableListData {
  const ancestors = getExtendedAncestors(entityType);
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    if (!page.items) return page;

    let pageChanged = false;
    const newItems = page.items.map((item) => {
      if (!item.id) return item;
      const enriched = enrichWithAncestorSlugs(item, memberships, ancestors, slugIndex);
      if (enriched !== item) pageChanged = true;
      return enriched;
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...page, items: newItems };
  });

  return dataChanged ? { ...data, pages: newPages } : data;
}

function buildSlugMap(entityType: ChannelEntityType): Map<string, string> {
  const slugMap = new Map<string, string>();
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data as EnrichableListData | undefined;
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
    writeKeepingMark(queryClient, queryKey, () => data);
  } finally {
    isEnriching = false;
  }
}

function enrichEntityType(entityType: ChannelEntityType, memberships: MembershipBase[], slugIndex: SlugIndex) {
  const cache = queryClient.getQueryCache();

  for (const query of cache.findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data as EnrichableListData | undefined;
    if (!data?.pages) continue;
    const enriched = enrichListData(data, memberships, entityType, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }

  const ancestors = getExtendedAncestors(entityType);
  for (const query of cache.findAll({ queryKey: [entityType, 'detail'] })) {
    const data = query.state.data as EnrichableChannel | undefined;
    if (!data?.id) continue;
    const enriched = enrichWithAncestorSlugs(data, memberships, ancestors, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }
}

/** Indexes every ancestor of this entity type, so enrichWithAncestorSlugs resolves slugs whichever type triggered enrichment. */
function ensureAncestorSlugs(entityType: ChannelEntityType, slugIndex: SlugIndex) {
  for (const ancestor of getExtendedAncestors(entityType)) {
    if (!slugIndex.has(ancestor)) slugIndex.set(ancestor, buildSlugMap(ancestor));
  }
}

/** Enriches each type once; one slug index serves them all, since enrichment never changes the ids and slugs it indexes. */
function enrichTypes(types: readonly ChannelEntityType[]) {
  // Loaded and empty still enriches: URLs need the slugs.
  const memberships = getCachedMemberships();
  if (!memberships) return;

  const slugIndex: SlugIndex = new Map();
  for (const type of types) {
    ensureAncestorSlugs(type, slugIndex);
    enrichEntityType(type, memberships, slugIndex);
  }
}

/** Enrich one entity type, then the child types that read its slugs as ancestors. */
function enrichTypeAndChildren(entityType: ChannelEntityType) {
  const childTypes = getRegisteredChannelTypes().filter(
    (childType) => childType !== entityType && (hierarchy.hasAncestor(childType, entityType) || isMenuParentOf(entityType, childType)),
  );
  enrichTypes([entityType, ...childTypes]);
}

export function initChannelEnrichment(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || isEnriching) return;
    // Only these two write data: a fetch start, an invalidation or a failure leaves the rows as enriched.
    if (event.action.type !== 'success' && event.action.type !== 'setState') return;

    const { queryKey } = event.query;
    const entityType = queryKey[0];

    // A membership carries ancestor ids a row may lack (a menu parent), so a change reaches every channel entity.
    if (entityType === 'me' && queryKey[1] === 'memberships') {
      enrichTypes(getRegisteredChannelTypes());
    } else if (typeof entityType === 'string' && isChannel(entityType) && (queryKey[1] === 'list' || queryKey[1] === 'detail')) {
      enrichTypeAndChildren(entityType);
    }
  });
}
