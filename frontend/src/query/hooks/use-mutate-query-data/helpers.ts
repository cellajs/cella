import type { QueryKey } from '@tanstack/react-query';
import type { Entity } from 'config';
import { getQueryKeySortOrder } from '~/query/helpers';
import type {
  ArbitraryEntityQueryData,
  ContextEntityData,
  EntityData,
  EntityQueryData,
  InfiniteEntityQueryData,
  ItemData,
  QueryDataActions,
} from '~/query/hooks/use-mutate-query-data/types';
import { queryClient } from '~/query/query-client';

/**
 * Determines if the given data matches the structure of ArbitraryEntityQueryData.
 *
 * @param data - The data to check.
 * @returns True if the data is ArbitraryEntityQueryData, false otherwise.
 */
export const isArbitraryQueryData = (data: unknown): data is ArbitraryEntityQueryData => {
  if (typeof data !== 'object' || data === null) return false;

  return Object.entries(data).every(([_, value]) => {
    if (!Array.isArray(value)) {
      return typeof value === 'object' && value !== null && 'entity' in value && 'id' in value;
    }

    return value.every((item) => typeof item === 'object' && item !== null && 'entity' in item && 'id' in item);
  });
};
/**
 * Updates the infinite query data based on the specified action.
 *
 * @param queryKey - Query key.
 * @param items - items to update.
 * @param action - `"create" | "update" | "remove" | "updateMembership"`
 */
export const changeInfiniteQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  const { sort, order: insertOrder } = getQueryKeySortOrder(queryKey);

  if ((action === 'create' && sort && sort !== 'createdAt') || (sort === 'createdAt' && insertOrder === 'asc')) {
    queryClient.invalidateQueries({ queryKey, exact: true });
    return;
  }

  queryClient.setQueryData<InfiniteEntityQueryData>(queryKey, (data) => {
    if (!data) return;

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
 * Updates the query data based on the specified action.
 *
 * @param queryKey - Query key.
 * @param items - items to update.
 * @param action - `"create" | "update" | "remove" | "updateMembership"`
 */
export const changeQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  queryClient.setQueryData<EntityQueryData>(queryKey, (data) => {
    if (!data) return;

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
 * Updates arbitrary query data based on the specified action.
 *
 * @param queryKey - Query key.
 * @param items - items to update.
 * @param action - `"create" | "update" | "remove" | "updateMembership"`
 * @param entity - Entity to update the data for.
 * @param keyToOperateIn - Optional key to specify which part of the data to update.
 */
export const changeArbitraryQueryData = (
  queryKey: QueryKey,
  items: EntityData[] | ContextEntityData[],
  action: QueryDataActions,
  entity: Entity,
  keyToOperateIn?: string,
) => {
  queryClient.setQueryData<ArbitraryEntityQueryData>(queryKey, (data) => {
    if (!data || !items.length) return data;

    const updatedData = { ...data }; // Create a copy of the data to modify

    for (const [key, value] of Object.entries(data)) {
      if (keyToOperateIn === key) {
        // If the value is an array, use updateArrayItems; otherwise, update the item directly
        updatedData[key] = Array.isArray(value) ? updateArrayItems(value, items, action) : updateItem(value, items[0], action);
        continue;
      }

      if ('entity' in value && value.entity === entity) {
        updatedData[key] = updateItem(value, items[0], action);
        continue;
      }

      // If the value is an array, check for entities within it and apply the action
      if (Array.isArray(value) && value.some((el) => el.entity === entity)) {
        const filteredArray = value.filter((el) => el.entity === entity);
        updatedData[key] = updateArrayItems(filteredArray, items, action);
      }
    }

    // Return the modified data after all operations
    return updatedData;
  });
};

/**
 * Helper function to update an array of items based on the action.
 *
 * @param items - Current items to update.
 * @param dataItems - Items to merge into current items.
 * @param action - `"create" | "update" | "remove" | "updateMembership"`
 * @returns The updated array of items.
 */
const updateArrayItems = <T extends ItemData>(items: T[], dataItems: T[], action: QueryDataActions, insertOrder?: 'asc' | 'desc') => {
  // Determine how to handle dataItems in the items array based on action type
  switch (action) {
    case 'create': {
      // Filter out already existing items based on their IDs
      const existingIds = items.map(({ id }) => id);
      const newItems = dataItems.filter((i) => !existingIds.includes(i.id));
      // Concatenate to add only new entries
      return insertOrder === 'asc' ? [...items, ...newItems] : [...newItems, ...items];
    }

    case 'update':
      // update existing items in dataItems
      return items.map((item) => dataItems.find((i) => i.id === item.id) ?? item);

    case 'remove': {
      // Exclude items matching IDs in dataItems
      const deleteIds = dataItems.map(({ id }) => id);
      return items.filter((item) => !deleteIds.includes(item.id));
    }

    case 'updateMembership': {
      // Update the membership field if it exists
      return items.map((item) => {
        if (item.membership) {
          const updatedMembership = dataItems.find((i) => i.id === item.membership?.id);
          return updatedMembership ? { ...item, membership: { ...item.membership, ...updatedMembership } } : item;
        }
        return item; // Return unchanged if no membership exists
      });
    }
    default:
      // Return items unchanged if action is unrecognized
      return items;
  }
};

/**
 * Helper function to update a single item based on the action.
 *
 * @param prevItem - Previous item to update.
 * @param newItem - New item to merge.
 * @param action - `"create" | "update" | "remove" | "updateMembership"`
 * @returns The updated item.
 */
const updateItem = <T extends ItemData>(prevItem: T, newItem: T, action: QueryDataActions) => {
  // Determine how to handle dataItems in the items array based on action type
  switch (action) {
    case 'update':
      return { ...prevItem, ...newItem };

    case 'updateMembership': {
      // update the membership field in dataItems
      return {
        ...prevItem,
        membership: { ...prevItem.membership, ...newItem },
      };
    }
    default:
      return prevItem;
  }
};
