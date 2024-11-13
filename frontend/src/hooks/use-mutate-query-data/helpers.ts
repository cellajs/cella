import type { QueryKey } from '@tanstack/react-query';
import type {
  ArbitraryEntityQueryData,
  EntityData,
  EntityQueryData,
  InfiniteEntityQueryData,
  ItemData,
  QueryDataActions,
} from '~/hooks/use-mutate-query-data/types';
import { queryClient } from '~/lib/router';
import type { Entity } from '~/types/common';

// Type guard

//determine if the data is QueryData
export const isQueryData = (data: unknown): data is EntityQueryData => {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
};

// determine if the data is InfiniteEntityQueryData
export const isInfiniteQueryData = (data: unknown): data is InfiniteEntityQueryData => {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
};

// determine if the data is ArbitraryEntityQueryData
export const isArbitraryQueryData = (data: unknown): data is ArbitraryEntityQueryData => {
  if (typeof data !== 'object' || data === null) return false;

  return Object.entries(data).every(([_, value]) => {
    if (!Array.isArray(value)) return 'entity' in value && 'id' in value && 'slug' in value;
    return value.every((item) => 'entity' in item && 'id' in item && 'slug' in value);
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
      items: updateArrayItems(items, page.items, action),
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

export const changeArbitraryQueryData = (queryKey: QueryKey, items: EntityData[], action: QueryDataActions, entity: Entity) => {
  queryClient.setQueryData<ArbitraryEntityQueryData>(queryKey, (data) => {
    if (!data) return data;
    const updatedData = { ...data };

    // Iterate through each entry in the data
    for (const [key, value] of Object.entries(data)) {
      if ('entity' in value && value.entity === entity) {
        const [newItem] = items;
        updatedData[key] = updateItem(value, newItem, action);
      }
      if (Array.isArray(value)) {
        const filteredArray = value.filter((el) => el.entity === entity);
        updatedData[key] = updateArrayItems(filteredArray, items, action);
      }
    }

    return updatedData; // Return the modified data
  });
};

// Helper funcs

const updateArrayItems = <T extends ItemData>(items: T[], dataItems: T[], action: QueryDataActions) => {
  // Determine how to handle dataItems in the items array based on action type
  switch (action) {
    case 'create':
      // concatenate to add new entries
      return [...items, ...dataItems];

    case 'update':
      // update existing items in dataItems
      return dataItems.map((item) => items.find((i) => i.id === item.id) || item);

    case 'delete':
      // filter out items in dataItems that match an id
      return dataItems.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id));

    case 'updateMembership': {
      // update the membership field in dataItems
      return dataItems.map((item) => {
        const updatedItem = items.find((i) => item.membership && i.id === item.membership.id);
        return updatedItem ? { ...item, membership: { ...item.membership, ...updatedItem } } : item;
      });
    }
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
