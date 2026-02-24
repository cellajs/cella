import type { Query } from '@tanstack/react-query';
import { type ContextEntityType, hierarchy } from 'shared';
import type { MembershipBase } from '~/api.gen';
import { enrichWithAncestorSlugs } from '~/query/enrichment/ancestor-slugs';
import {
  getCachedMemberships,
  getContextEntityKeys,
  getMenuParentTypes,
  getRegisteredContextEntities,
  isMenuParentOf,
} from '~/query/enrichment/helpers';
import { enrichWithMembership } from '~/query/enrichment/membership';
import { enrichWithPermissions } from '~/query/enrichment/permissions';
import type { EnrichableEntity, InfiniteData } from '~/query/enrichment/types';
import { queryClient } from '~/query/query-client';

/** Re-entrancy guard: prevents the subscriber from reacting to its own cache writes */
let isEnriching = false;

/** Cache of extended ancestors (hierarchy + menu parents) per entity type */
const extendedAncestorsCache = new Map<ContextEntityType, readonly ContextEntityType[]>();

/**
 * Get ancestors including menu parent types for URL building.
 * Hierarchy ancestors come first, then menu parents not already in the list.
 * E.g. for project: ['organization'] (hierarchy) + ['workspace'] (menu parent).
 */
function getExtendedAncestors(entityType: ContextEntityType): readonly ContextEntityType[] {
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
  entityType: ContextEntityType,
  ancestors: readonly ContextEntityType[],
): EnrichableEntity {
  let result = enrichWithMembership(item, memberships);
  result = enrichWithPermissions(result, entityType);
  result = enrichWithAncestorSlugs(result, ancestors);
  return result;
}

/**
 * Enrich all items in list query data. Returns same reference when nothing changed.
 */
function enrichListData(
  data: InfiniteData,
  memberships: MembershipBase[],
  entityType: ContextEntityType,
): InfiniteData {
  const ancestors = getExtendedAncestors(entityType);
  let dataChanged = false;

  const newPages = data.pages.map((page) => {
    if (!page.items) return page;

    let pageChanged = false;
    const newItems = page.items.map((item) => {
      if (!item.id) return item;
      const enriched = enrichItem(item, memberships, entityType, ancestors);
      if (enriched !== item) pageChanged = true;
      return enriched;
    });

    if (!pageChanged) return page;
    dataChanged = true;
    return { ...page, items: newItems };
  });

  return dataChanged ? { ...data, pages: newPages } : data;
}

/**
 * Enrich a single entity in a detail query's data if anything changed.
 */
function enrichDetailQuery(query: Query, memberships: MembershipBase[], entityType: ContextEntityType): void {
  const data = (query.state.data ?? null) as EnrichableEntity | null;
  if (!data?.id) return;

  const ancestors = getExtendedAncestors(entityType);
  const enriched = enrichItem(data, memberships, entityType, ancestors);
  if (enriched === data) return;

  isEnriching = true;
  try {
    queryClient.setQueryData(query.queryKey, enriched);
  } finally {
    isEnriching = false;
  }
}

/**
 * Enrich list queries for a given entity type. Uses registered query keys for targeted lookup.
 */
function enrichListQueriesForType(
  entityType: ContextEntityType,
  listBase: readonly unknown[],
  memberships: MembershipBase[],
): void {
  for (const [queryKey, data] of queryClient.getQueriesData<InfiniteData>({ queryKey: listBase })) {
    if (!data?.pages) continue;
    const enriched = enrichListData(data, memberships, entityType);
    if (enriched === data) continue;

    isEnriching = true;
    try {
      queryClient.setQueryData(queryKey, enriched);
    } finally {
      isEnriching = false;
    }
  }
}

/**
 * Enrich detail queries for a given entity type. Uses registered query keys for targeted lookup.
 */
function enrichDetailQueriesForType(
  entityType: ContextEntityType,
  detailBase: readonly unknown[],
  memberships: MembershipBase[],
): void {
  for (const q of queryClient.getQueryCache().findAll({ queryKey: detailBase })) {
    enrichDetailQuery(q as Query, memberships, entityType);
  }
}

/**
 * Subscribe to query cache for automatic enrichment of context entity lists and details.
 * Call once during app initialization.
 *
 * Uses the entity query registry + hierarchy as single source of truth:
 * - Only processes entity types that have registered query keys and are context entities
 * - Ancestor dependencies are derived from the hierarchy, not duplicated
 *
 * Enrichment pipeline (per item):
 *   1. membership — bakes user's membership onto the entity
 *   2. permissions — computes entity-type-keyed `can` map from membership + policies
 *   3. ancestor-slugs — resolves parent slugs for URL building
 */
export function initContextEntityEnrichment(): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || isEnriching) return;

    const query = event.query as Query;
    const queryKey = query.queryKey;
    const memberships = getCachedMemberships();

    // Memberships updated — re-enrich all registered context entity queries
    if (queryKey[0] === 'me' && queryKey[1] === 'memberships') {
      if (!memberships?.length) return;

      for (const { type, keys } of getRegisteredContextEntities()) {
        enrichListQueriesForType(type, keys.list.base, memberships);
        enrichDetailQueriesForType(type, keys.detail.base, memberships);
      }
      return;
    }

    // Identify the entity type from the event's query key via registry
    const entityType = typeof queryKey[0] === 'string' ? queryKey[0] : null;
    if (!entityType || !memberships?.length) return;

    const entry = getContextEntityKeys(entityType);
    if (!entry) return;

    // Entity list updated — enrich and propagate ancestor slugs to children
    if (queryKey[1] === 'list') {
      enrichListQueriesForType(entry.type, entry.keys.list.base, memberships);

      // Re-enrich child types that depend on this type for ancestor slugs
      // Includes both hierarchy children and menu subentity types
      for (const { type: childType, keys: childKeys } of getRegisteredContextEntities()) {
        if (childType === entry.type) continue;
        if (hierarchy.hasAncestor(childType, entry.type) || isMenuParentOf(entry.type, childType)) {
          enrichListQueriesForType(childType, childKeys.list.base, memberships);
        }
      }
      return;
    }

    // Entity detail updated — enrich single entity
    if (queryKey[1] === 'detail') {
      enrichDetailQuery(query, memberships, entry.type);
    }
  });
}
