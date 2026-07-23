import type { QueryClient } from '@tanstack/react-query';
import { appConfig, hierarchy } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { ItemData, OrgRoutableItemData, RoutableItemData } from '~/query/basic/types';
import { getEntityQueryKeys } from './entity-query-registry';

/**
 * The row's effective home channel id: deepest non-null ancestor, the org itself for org-homed
 * rows. The same resolution SSE routing uses (resolve-row-channel), so cache placement and stream
 * routing can never disagree.
 */
export function resolveHomeChannelId(entityType: string, entity: ItemData): string | null {
  const entityRecord = asRecord(entity);
  const home = hierarchy.resolveDeepestAncestorId(entityType, entityRecord);
  if (home) return home;
  const organizationId = entityRecord.organizationId;
  return typeof organizationId === 'string' ? organizationId : null;
}

/**
 * Match a row's sole canonical home-list key.
 * Exclude filtered keys whose server predicates cannot be reproduced locally.
 */
export function matchesCanonicalHome(
  queryKey: readonly unknown[],
  organizationId: string,
  homeChannelId: string,
): boolean {
  return queryKey.length === 4 && queryKey[2] === organizationId && queryKey[3] === homeChannelId;
}

/** True when the row moved to a different parent channel (any context id column differs). */
function hasParentChannelChanged(cached: ItemData, incoming: ItemData): boolean {
  const c = asRecord(cached);
  const i = asRecord(incoming);
  for (const entityType of appConfig.channelEntityTypes) {
    const key = appConfig.entityIdColumnKeys[entityType];
    if (typeof c[key] === 'string' && typeof i[key] === 'string' && c[key] !== i[key]) return true;
  }
  return false;
}

export interface SpliceResult {
  /** The row was already present in at least one scanned list cache. */
  seen: boolean;
  /** The row was newly inserted into its canonical home list. */
  spliced: boolean;
  /** At least one filtered list (object key segment) was scanned; its server-side filter can't be
   *  replicated locally, so callers invalidate those separately. */
  sawFilteredList: boolean;
}

/**
 * Applies an entity across organization list caches using canonical-home placement.
 * Existing rows update in place; unknown rows enter only an unfiltered home list.
 * Parent moves may remove cached rows when requested.
 */
export function spliceEntityIntoListCaches(
  queryClient: QueryClient,
  entity: RoutableItemData,
  opts: { removeOnParentChannelChange?: boolean } = {},
): SpliceResult {
  const { removeOnParentChannelChange = false } = opts;
  const { entityType, organizationId = null } = entity;
  const keys = getEntityQueryKeys(entityType);
  const homeChannelId = resolveHomeChannelId(entityType, entity);

  let seen = false;
  let spliced = false;
  let sawFilteredList = false;
  const listPrefix = organizationId ? keys.list.org(organizationId) : keys.list.base;

  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: listPrefix })) {
    sawFilteredList ||= queryKey.slice(2).some((seg) => typeof seg === 'object' && seg !== null);

    let cachedItem: ItemData | undefined;
    let change: typeof changeQueryData;
    if (isInfiniteQueryData<ItemData>(queryData)) {
      cachedItem = queryData.pages.flatMap((p) => p.items).find((item) => item.id === entity.id);
      change = changeInfiniteQueryData;
    } else if (isQueryData<ItemData>(queryData)) {
      cachedItem = queryData.items.find((item) => item.id === entity.id);
      change = changeQueryData;
    } else {
      continue;
    }

    if (removeOnParentChannelChange && cachedItem && hasParentChannelChanged(cachedItem, entity)) {
      change(queryKey, [entity], 'remove');
      continue;
    }

    const isHomeList =
      !!organizationId && !!homeChannelId && matchesCanonicalHome(queryKey, organizationId, homeChannelId);
    seen = seen || !!cachedItem;
    spliced ||= !cachedItem && isHomeList;
    change(queryKey, [entity], cachedItem || !isHomeList ? 'update' : 'create');
  }

  return { seen, spliced, sawFilteredList };
}

/**
 * Insert (or update in place) optimistic or server-confirmed rows into their canonical home lists,
 * never into filtered/search lists. The mutation-path counterpart of the realtime splice: creates
 * splice into the home list live sync owns; a row already present anywhere updates in place.
 */
export function insertEntitiesIntoHome(queryClient: QueryClient, entities: OrgRoutableItemData[]): void {
  for (const entity of entities) spliceEntityIntoListCaches(queryClient, entity);
}
