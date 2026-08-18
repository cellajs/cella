import type { QueryKey } from '@tanstack/react-query';
import type { ChannelBase } from 'sdk';
import type { EntityType } from 'shared';
import type {
  ArbitraryEntityQueryData,
  EntityIdAndType,
  EntityQueryData,
  InfiniteEntityQueryData,
  ItemData,
  QueryDataActions,
} from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import { getQueryKeySortOrder } from './get-query-key-sort-order';

/** ArbitraryEntityQueryData is an object whose values are entity refs or arrays of entity refs. */
export const isArbitraryQueryData = (data: unknown): data is ArbitraryEntityQueryData => {
  if (typeof data !== 'object' || data === null) return false;

  return Object.entries(data).every(([_, value]) => {
    if (!Array.isArray(value)) {
      return typeof value === 'object' && value !== null && 'entityType' in value && 'id' in value;
    }

    return value.every((item) => typeof item === 'object' && item !== null && 'entityType' in item && 'id' in item);
  });
};

export const changeInfiniteQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  const { order: insertOrder } = getQueryKeySortOrder(queryKey);

  queryClient.setQueryData<InfiniteEntityQueryData>(queryKey, (data) => {
    if (!data) return;

    // Returning the same reference keeps React Query from notifying observers.
    if (action === 'update' || action === 'remove') {
      const updateIds = new Set(items.map((i) => i.id));
      const hasMatch = data.pages.some((page) => page.items.some((item) => updateIds.has(item.id)));
      if (!hasMatch) return data;
    }

    // Count only rows that change membership: items.length would drift `total` when the input partially overlaps this query.
    const existingIds = new Set(data.pages.flatMap((page) => page.items).map(({ id }) => id));
    const totalAdjustment =
      action === 'create'
        ? items.filter(({ id }) => !existingIds.has(id)).length
        : action === 'remove'
          ? -items.filter(({ id }) => existingIds.has(id)).length
          : 0;

    const pages = data.pages.map((page) => ({
      items: updateArrayItems(page.items, items, action, insertOrder),
      total: page.total + totalAdjustment,
    }));

    return { pages, pageParams: data.pageParams };
  });
};

export const changeQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  queryClient.setQueryData<EntityQueryData>(queryKey, (data) => {
    if (!data) return;

    // Returning the same reference keeps React Query from notifying observers.
    if (action === 'update' || action === 'remove') {
      const updateIds = new Set(items.map((i) => i.id));
      if (!data.items.some((existing) => updateIds.has(existing.id))) return data;
    }

    // Count only rows that change membership: items.length would drift `total` when the input partially overlaps this query.
    const existingIds = new Set(data.items.map(({ id }) => id));
    const totalAdjustment =
      action === 'create'
        ? items.filter(({ id }) => !existingIds.has(id)).length
        : action === 'remove'
          ? -items.filter(({ id }) => existingIds.has(id)).length
          : 0;

    return {
      items: updateArrayItems(data.items, items, action),
      total: data.total + totalAdjustment,
    };
  });
};

/** With `keyToOperateIn` only that key is updated; otherwise every entry matching `entityType` across the data shape is. */
export const changeArbitraryQueryData = (
  queryKey: QueryKey,
  items: EntityIdAndType[] | ChannelBase[],
  action: QueryDataActions,
  entityType: EntityType,
  keyToOperateIn?: string,
) => {
  queryClient.setQueryData<ArbitraryEntityQueryData>(queryKey, (data) => {
    if (!data || !items.length) return data;

    const updatedData = { ...data };

    for (const [key, value] of Object.entries(data)) {
      if (keyToOperateIn === key) {
        updatedData[key] = Array.isArray(value)
          ? updateArrayItems(value, items, action)
          : updateItem(value, items[0], action);
        continue;
      }

      if ('entityType' in value && value.entityType === entityType) {
        updatedData[key] = updateItem(value, items[0], action);
        continue;
      }

      if (Array.isArray(value) && value.some((el) => el.entityType === entityType)) {
        const filteredArray = value.filter((el) => el.entityType === entityType);
        updatedData[key] = updateArrayItems(filteredArray, items, action);
      }
    }

    return updatedData;
  });
};

// Apply create/update/remove to an items array, optionally inserting new items in `insertOrder`.
const updateArrayItems = <T extends ItemData>(
  items: T[],
  dataItems: T[],
  action: QueryDataActions,
  insertOrder?: 'asc' | 'desc',
) => {
  switch (action) {
    case 'create': {
      const existingIds = new Set(items.map(({ id }) => id));
      const newItems = dataItems.filter((i) => !existingIds.has(i.id));
      return insertOrder === 'asc' ? [...items, ...newItems] : [...newItems, ...items];
    }

    case 'update': {
      const updates = new Map(dataItems.map((i) => [i.id, i]));
      return items.map((item) => updates.get(item.id) ?? item);
    }

    case 'remove': {
      const deleteIds = new Set(dataItems.map(({ id }) => id));
      return items.filter((item) => !deleteIds.has(item.id));
    }

    default:
      return items;
  }
};

// Apply an action to a single item: merges fields on update, returns prev item otherwise.
const updateItem = <T extends ItemData>(prevItem: T, newItem: T, action: QueryDataActions) => {
  switch (action) {
    case 'update':
      return { ...prevItem, ...newItem };

    default:
      return prevItem;
  }
};
