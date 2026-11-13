import type { Query } from '@tanstack/react-query';
import { type ChannelEntityType, hierarchy, isChannel } from 'shared';
import { writeKeepingMark } from '~/query/basic/cache-mutations';
import { getRegisteredEntityTypes } from '~/query/basic/entity-query-registry';
import { isInfiniteQueryData } from '~/query/basic/mutate-query';
import { enrichWithAncestorSlugs, type SlugIndex } from '~/query/enrichment/ancestor-slugs';
import type { EnrichableChannel, EnrichableListData } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

/** Re-entrancy guard: keeps the subscriber from reacting to its own cache writes. */
let isEnriching = false;

const getRegisteredChannelTypes = (): ChannelEntityType[] => getRegisteredEntityTypes().filter(isChannel);

function enrichListData(data: EnrichableListData, entityType: ChannelEntityType, slugIndex: SlugIndex): EnrichableListData {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    let pageChanged = false;
    const results = page.results.map((item) => {
      const enriched = enrichWithAncestorSlugs(item, ancestors, slugIndex);
      if (enriched !== item) pageChanged = true;
      return enriched;
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...page, results };
  });

  return dataChanged ? { ...data, pages: newPages } : data;
}

function buildSlugMap(entityType: ChannelEntityType): Map<string, string> {
  const slugMap = new Map<string, string>();
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data;
    if (!isInfiniteQueryData<EnrichableChannel>(data)) continue;
    for (const page of data.pages) {
      for (const item of page.results) slugMap.set(item.id, item.slug);
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

function enrichEntityType(entityType: ChannelEntityType, slugIndex: SlugIndex) {
  const cache = queryClient.getQueryCache();

  for (const query of cache.findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data;
    if (!isInfiniteQueryData<EnrichableChannel>(data)) continue;
    const enriched = enrichListData(data, entityType, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }

  const ancestors = hierarchy.getOrderedAncestors(entityType);
  for (const query of cache.findAll({ queryKey: [entityType, 'detail'] })) {
    const data = query.state.data as EnrichableChannel | undefined;
    if (!data) continue;
    const enriched = enrichWithAncestorSlugs(data, ancestors, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }
}

/** Indexes every ancestor of this entity type, so enrichWithAncestorSlugs resolves slugs whichever type triggered enrichment. */
function ensureAncestorSlugs(entityType: ChannelEntityType, slugIndex: SlugIndex) {
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    if (!slugIndex.has(ancestor)) slugIndex.set(ancestor, buildSlugMap(ancestor));
  }
}

/** Enrich one entity type, then the child types that read its slugs as ancestors; one slug index serves them all, since enrichment never changes the ids and slugs it indexes. */
function enrichTypeAndChildren(entityType: ChannelEntityType) {
  const childTypes = getRegisteredChannelTypes().filter((childType) => childType !== entityType && hierarchy.hasAncestor(childType, entityType));

  const slugIndex: SlugIndex = new Map();
  for (const type of [entityType, ...childTypes]) {
    ensureAncestorSlugs(type, slugIndex);
    enrichEntityType(type, slugIndex);
  }
}

export function initChannelEnrichment(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || isEnriching) return;
    // Only these two write data: a fetch start, an invalidation or a failure leaves the rows as enriched.
    if (event.action.type !== 'success' && event.action.type !== 'setState') return;

    const entityType = event.query.queryKey[0];
    const kind = event.query.queryKey[1];
    if (typeof entityType === 'string' && isChannel(entityType) && (kind === 'list' || kind === 'detail')) enrichTypeAndChildren(entityType);
  });
}
