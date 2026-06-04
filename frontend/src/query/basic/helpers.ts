import type { QueryKey } from '@tanstack/react-query';
import type { ContextEntityBase } from 'sdk';
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

/**
 * Type guard for ArbitraryEntityQueryData (an object whose values are entity refs or arrays of entity refs).
 */
export const isArbitraryQueryData = (data: unknown): data is ArbitraryEntityQueryData => {
  if (typeof data !== 'object' || data === null) return false;

  return Object.entries(data).every(([_, value]) => {
    if (!Array.isArray(value)) {
      return typeof value === 'object' && value !== null && 'entityType' in value && 'id' in value;
    }

    return value.every((item) => typeof item === 'object' && item !== null && 'entityType' in item && 'id' in item);
  });
};

/**
 * Apply a `create | update | remove` action to all pages of an infinite query for `queryKey`.
 */
export const changeInfiniteQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  const { order: insertOrder } = getQueryKeySortOrder(queryKey);

  queryClient.setQueryData<InfiniteEntityQueryData>(queryKey, (data) => {
    if (!data) return;

    // Bail out early if none of the items exist in this query — returning the
    // same reference prevents React Query from notifying observers.
    if (action === 'update' || action === 'remove') {
      const updateIds = new Set(items.map((i) => i.id));
      const hasMatch = data.pages.some((page) => page.items.some((item) => updateIds.has(item.id)));
      if (!hasMatch) return data;
    }

    // Adjust total based on the action
    const totalAdjustment = action === 'create' ? items.length : action === 'remove' ? -items.length : 0;

    // Update items in each page and adjust the total
    const pages = data.pages.map((page) => ({
      items: updateArrayItems(page.items, items, action, insertOrder),
      total: page.total + totalAdjustment,
    }));

    return { pages, pageParams: data.pageParams };
  });
};

/**
 * Apply a `create | update | remove` action to a standard (non-infinite) query for `queryKey`.
 */
export const changeQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  queryClient.setQueryData<EntityQueryData>(queryKey, (data) => {
    if (!data) return;

    // Bail out early if none of the items exist in this query — returning the
    // same reference prevents React Query from notifying observers.
    if (action === 'update' || action === 'remove') {
      const updateIds = new Set(items.map((i) => i.id));
      if (!data.items.some((existing) => updateIds.has(existing.id))) return data;
    }

    // Adjust total based on the action
    const totalAdjustment = action === 'create' ? items.length : action === 'remove' ? -items.length : 0;

    // Update items and adjust the total
    return {
      items: updateArrayItems(data.items, items, action),
      total: data.total + totalAdjustment,
    };
  });
};

/**
 * Apply a `create | update | remove` action to arbitrary query data, scoped by `entityType`.
 * When `keyToOperateIn` is provided, only that key is updated; otherwise all matching
 * entries (by `entityType`) across the data shape are updated.
 */
export const changeArbitraryQueryData = (
  queryKey: QueryKey,
  items: EntityIdAndType[] | ContextEntityBase[],
  action: QueryDataActions,
  entityType: EntityType,
  keyToOperateIn?: string,
) => {
  queryClient.setQueryData<ArbitraryEntityQueryData>(queryKey, (data) => {
    if (!data || !items.length) return data;

    const updatedData = { ...data }; // Create a copy of the data to modify

    for (const [key, value] of Object.entries(data)) {
      if (keyToOperateIn === key) {
        // If the value is an array, use updateArrayItems; otherwise, update the item directly
        updatedData[key] = Array.isArray(value)
          ? updateArrayItems(value, items, action)
          : updateItem(value, items[0], action);
        continue;
      }

      if ('entityType' in value && value.entityType === entityType) {
        updatedData[key] = updateItem(value, items[0], action);
        continue;
      }

      // If the value is an array, check for entities within it and apply the action
      if (Array.isArray(value) && value.some((el) => el.entityType === entityType)) {
        const filteredArray = value.filter((el) => el.entityType === entityType);
        updatedData[key] = updateArrayItems(filteredArray, items, action);
      }
    }

    // Return the modified data after all operations
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
  // Determine how to handle dataItems in the items array based on action type
  switch (action) {
    case 'create': {
      // Filter out already existing items based on their IDs
      const existingIds = new Set(items.map(({ id }) => id));
      const newItems = dataItems.filter((i) => !existingIds.has(i.id));
      // Concatenate to add only new entries
      return insertOrder === 'asc' ? [...items, ...newItems] : [...newItems, ...items];
    }

    case 'update': {
      const updates = new Map(dataItems.map((i) => [i.id, i]));
      return items.map((item) => updates.get(item.id) ?? item);
    }

    case 'remove': {
      // Exclude items matching IDs in dataItems
      const deleteIds = new Set(dataItems.map(({ id }) => id));
      return items.filter((item) => !deleteIds.has(item.id));
    }

    default:
      // Return items unchanged if action is unrecognized
      return items;
  }
};

// Apply an action to a single item: merges fields on update, returns prev item otherwise.
const updateItem = <T extends ItemData>(prevItem: T, newItem: T, action: QueryDataActions) => {
  // Determine how to handle dataItems in the items array based on action type
  switch (action) {
    case 'update':
      return { ...prevItem, ...newItem };

    default:
      return prevItem;
  }
};
