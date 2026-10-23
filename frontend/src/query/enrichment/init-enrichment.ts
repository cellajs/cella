import type { Query } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { type ChannelEntityType, hierarchy, isChannel } from 'shared';
import { enrichWithAncestorSlugs, type SlugIndex } from '~/query/enrichment/ancestor-slugs';
import { getCachedInvitedIds, getCachedMemberships, getMenuParentTypes, getRegisteredChannelTypes, isMenuParentOf } from '~/query/enrichment/helpers';
import { enrichWithInvitation, enrichWithMembership } from '~/query/enrichment/membership';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
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

/** The viewer's own state the enrichers read: memberships, and the invited channel ids once the invites list is cached. */
type ViewerState = { memberships: MembershipBase[]; invitedIds: ReadonlySet<string> | null };

/** Order matters: membership runs first, since permissions and ancestor-slugs read item.membership. Each enricher returns the same reference when unchanged. */
function enrichItem(
  item: EnrichableChannel,
  { memberships, invitedIds }: ViewerState,
  entityType: ChannelEntityType,
  ancestors: readonly ChannelEntityType[],
  slugIndex: SlugIndex,
): EnrichableChannel {
  let result = enrichWithMembership(item, memberships);
  result = enrichWithInvitation(result, invitedIds);
  result = enrichWithPermissions(result, entityType, memberships);
  result = enrichWithAncestorSlugs(result, ancestors, slugIndex);
  return result;
}

function enrichListData(data: EnrichableListData, viewer: ViewerState, entityType: ChannelEntityType, slugIndex: SlugIndex): EnrichableListData {
  const ancestors = getExtendedAncestors(entityType);
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    if (!page.items) return page;

    let pageChanged = false;
    const newItems = page.items.map((item) => {
      if (!item.id) return item;
      const enriched = enrichItem(item, viewer, entityType, ancestors, slugIndex);
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
    queryClient.setQueryData(queryKey, data);
  } finally {
    isEnriching = false;
  }
}

function enrichEntityType(entityType: ChannelEntityType, viewer: ViewerState, slugIndex: SlugIndex) {
  const cache = queryClient.getQueryCache();

  for (const query of cache.findAll({ queryKey: [entityType, 'list'] })) {
    const data = query.state.data as EnrichableListData | undefined;
    if (!data?.pages) continue;
    const enriched = enrichListData(data, viewer, entityType, slugIndex);
    if (enriched !== data) setCacheData(query.queryKey, enriched);
  }

  const ancestors = getExtendedAncestors(entityType);
  for (const query of cache.findAll({ queryKey: [entityType, 'detail'] })) {
    const data = query.state.data as EnrichableChannel | undefined;
    if (!data?.id) continue;
    const enriched = enrichItem(data, viewer, entityType, ancestors, slugIndex);
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
  // Loaded and empty still enriches: a system admin holds every action without a membership, and URLs need the slugs.
  const memberships = getCachedMemberships();
  if (!memberships) return;
  const viewer: ViewerState = { memberships, invitedIds: getCachedInvitedIds() };

  const slugIndex: SlugIndex = new Map();
  for (const type of types) {
    ensureAncestorSlugs(type, slugIndex);
    enrichEntityType(type, viewer, slugIndex);
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

    // A membership or invitation change affects every channel entity.
    if (entityType === 'me' && (queryKey[1] === 'memberships' || queryKey[1] === 'invites')) {
      enrichTypes(getRegisteredChannelTypes());
    } else if (typeof entityType === 'string' && isChannel(entityType) && (queryKey[1] === 'list' || queryKey[1] === 'detail')) {
      enrichTypeAndChildren(entityType);
    }
  });
}
