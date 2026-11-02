import type { QueryClient } from '@tanstack/react-query';
import { appConfig, hierarchy } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { type ListChanges, writeKeepingMark, writeListChanges } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { getQueryItems, isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { ItemData, OrgRoutableItemData, RoutableItemData } from '~/query/basic/types';

/** Deepest non-null ancestor, or the org for org-homed rows. Matches `hierarchy.resolveDeepestAncestorId`, so cache placement and stream routing cannot disagree. */
export function resolveHomeChannelId(entityType: string, entity: ItemData): string | null {
  const entityRecord = asRecord(entity);
  const home = hierarchy.resolveDeepestAncestorId(entityType, entityRecord);
  if (home) return home;
  const organizationId = entityRecord.organizationId;
  return typeof organizationId === 'string' ? organizationId : null;
}

/** Excludes filtered keys, whose server predicates cannot be reproduced locally. */
export function matchesCanonicalHome(queryKey: readonly unknown[], organizationId: string, homeChannelId: string): boolean {
  return queryKey.length === 4 && queryKey[2] === organizationId && queryKey[3] === homeChannelId;
}

/** Only the channel id columns both copies carry count, so a partial row never reads as moved. */
function hasParentChannelChanged(cached: ItemData, incoming: ItemData): boolean {
  const cachedRow = asRecord(cached);
  const incomingRow = asRecord(incoming);
  for (const entityType of appConfig.channelEntityTypes) {
    const key = appConfig.entityIdColumnKeys[entityType];
    if (typeof cachedRow[key] === 'string' && typeof incomingRow[key] === 'string' && cachedRow[key] !== incomingRow[key]) return true;
  }
  return false;
}

export interface SpliceResult {
  /** Rows already present in at least one scanned list cache, by id. */
  seen: Set<string>;
  /** Rows newly inserted into their canonical home list, by id. */
  spliced: Set<string>;
  /** At least one filtered list was scanned. Its server-side filter cannot be replicated locally, so callers invalidate those separately. */
  sawFilteredList: boolean;
}

/**
 * Applies rows of one entity type and organization, with distinct ids, across its list caches by canonical-home placement,
 * writing each list once: existing rows update in place, unknown rows enter only an unfiltered home list, and a row that
 * `isRemoved` matches leaves every list. A parent move removes the cached row when `removeOnParentChannelChange` is set;
 * `rowFor` builds each list's row from its cached copy.
 */
export function spliceEntitiesIntoListCaches(
  queryClient: QueryClient,
  entities: RoutableItemData[],
  options: {
    isRemoved?: (entity: RoutableItemData) => boolean;
    removeOnParentChannelChange?: boolean;
    rowFor?: (entity: RoutableItemData, cachedItem: ItemData | undefined) => ItemData;
  } = {},
): SpliceResult {
  const { isRemoved, removeOnParentChannelChange = false, rowFor = (entity) => entity } = options;
  const result: SpliceResult = { seen: new Set(), spliced: new Set(), sawFilteredList: false };
  const [first] = entities;
  if (!first) return result;

  const { entityType, organizationId = null } = first;
  const keys = getEntityQueryKeys(entityType);
  const listPrefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  const homed = entities.map((entity) => ({ entity, homeChannelId: resolveHomeChannelId(entityType, entity) }));

  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: listPrefix })) {
    result.sawFilteredList ||= queryKey.slice(2).some((segment) => typeof segment === 'object' && segment !== null);

    if (!isQueryData<ItemData>(queryData) && !isInfiniteQueryData<ItemData>(queryData)) continue;
    const cachedItems = new Map(getQueryItems(queryData).map((item) => [item.id, item]));
    const changes: ListChanges = { remove: [], update: [], create: [] };

    for (const { entity, homeChannelId } of homed) {
      const cachedItem = cachedItems.get(entity.id);
      if (isRemoved?.(entity) || (removeOnParentChannelChange && cachedItem && hasParentChannelChanged(cachedItem, entity))) {
        changes.remove.push(entity);
      } else if (cachedItem) {
        result.seen.add(entity.id);
        changes.update.push(rowFor(entity, cachedItem));
      } else if (organizationId && homeChannelId && matchesCanonicalHome(queryKey, organizationId, homeChannelId)) {
        result.spliced.add(entity.id);
        changes.create.push(rowFor(entity, undefined));
      }
    }
    writeListChanges(queryKey, changes);
  }

  return result;
}

/**
 * Mutation-path counterpart of the realtime splice: creates enter only the canonical home list live sync owns, never a filtered or search list, and a row present anywhere updates in place.
 * That includes a cached detail: an edit issued while the row's create is out writes one from the optimistic row, which the stored row replaces here.
 */
export function insertEntitiesIntoHome(queryClient: QueryClient, entities: OrgRoutableItemData[]): void {
  for (const entity of entities) {
    spliceEntitiesIntoListCaches(queryClient, [entity]);
    writeKeepingMark<ItemData>(queryClient, getEntityQueryKeys(entity.entityType).detail.byId(entity.id), (cached) => cached && entity);
  }
}
