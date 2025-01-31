import type { QueryKey } from '@tanstack/react-query';
import type { Entity } from 'config';
import { queryClient } from '~/lib/router';
import type {
  ArbitraryEntityQueryData,
  ContextEntityData,
  EntityData,
  EntityQueryData,
  InfiniteEntityQueryData,
  ItemData,
  QueryDataActions,
} from '~/query/hooks/use-mutate-query-data/types';

// determine if the data is ArbitraryEntityQueryData
export const isArbitraryQueryData = (data: unknown): data is ArbitraryEntityQueryData => {
  if (typeof data !== 'object' || data === null) return false;

  return Object.entries(data).every(([_, value]) => {
    if (!Array.isArray(value)) return 'entity' in value && 'id' in value;
    return value.every((item) => 'entity' in item && 'id' in item);
  });
};

// Data change

export const changeInfiniteQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  queryClient.setQueryData<InfiniteEntityQueryData>(queryKey, (data) => {
    if (!data) return;

    // Adjust total based on the action
    const totalAdjustment = action === 'create' ? items.length : action === 'delete' ? -items.length : 0;

    // Update items in each page and adjust the total
    const pages = data.pages.map((page) => ({
      items: updateArrayItems(page.items, items, action),
      total: page.total + totalAdjustment,
    }));

    return { pages, pageParams: data.pageParams };
  });
};

export const changeQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  queryClient.setQueryData<EntityQueryData>(queryKey, (data) => {
    if (!data) return;

    // Adjust total based on the action
    const totalAdjustment = action === 'create' ? items.length : action === 'delete' ? -items.length : 0;

    // Update items and adjust the total
    return {
      items: updateArrayItems(data.items, items, action),
      total: data.total + totalAdjustment,
    };
  });
};

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

// Helper funcs

const updateArrayItems = <T extends ItemData>(items: T[], dataItems: T[], action: QueryDataActions) => {
  // Determine how to handle dataItems in the items array based on action type
  switch (action) {
    case 'create': {
      // Filter out already existing items based on their IDs
      const existingIds = items.map(({ id }) => id);
      const newItems = dataItems.filter((i) => !existingIds.includes(i.id));
      // Concatenate to add only new entries
      return [...items, ...newItems];
    }

    case 'update':
      // update existing items in dataItems
      return items.map((item) => dataItems.find((i) => i.id === item.id) ?? item);

    case 'delete': {
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
