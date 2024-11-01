import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';
import type { Entity, MinimumEntityItem, MinimumMembershipInfo } from '~/types/common';

interface Item {
  id: string;
  membership?: { id: string } | null;
}
type EntityMutateData = MinimumEntityItem & { membership: MinimumMembershipInfo | null };

type QueryDataActions = 'create' | 'update' | 'delete' | 'updateMembership';

type ArbitraryEntityQueryData = Record<string, EntityMutateData | EntityMutateData[]>;

type InfiniteEntityQueryData = InfiniteData<{ items: Item[]; total: number }>;

export const useMutateInfiniteQueryData = (passedQueryKey: QueryKey, invalidateKeyGetter: (item: Item) => QueryKey) => {
  return (items: Item[], action: QueryDataActions) => {
    const passedQueryData = queryClient.getQueryData(passedQueryKey);
    const passedQuery: [QueryKey, unknown] = [passedQueryKey, passedQueryData];

    // get similar queries
    const similarQueries = queryClient.getQueriesData({ queryKey: passedQueryKey });
    // queries to update
    const queriesToWorkOn = passedQueryData ? [passedQuery] : similarQueries;

    // update  query data
    for (const [queryKey] of queriesToWorkOn) changeInfiniteQueryData(queryKey, items, action);

    // invalidate queries
    for (const item of items) {
      const queryKeyToInvalidate = invalidateKeyGetter(item);
      queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
    }
  };
};

export const useMutateEntityQueryData = (queryKey: QueryKey) => {
  const queryClient = useQueryClient();

  return (items: EntityMutateData[], entity: Entity, action: QueryDataActions) => {
    queryClient.setQueryData<ArbitraryEntityQueryData>(queryKey, (data) => {
      if (!data) return data;
      const updatedData = { ...data };

      // Iterate through each entry in the data
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          const hasEntityInList = value.some((el) => el.entity === entity);
          if (!hasEntityInList) continue; // Skip if entity is not in the list
          updatedData[key] = updateArrayItems(value, items, action);
        }
        // Handle cases where the value is a single entity
        if ('entity' in value && value.entity === entity) {
          const [newItem] = items;
          updatedData[key] = updateItem(value, newItem, action);
        }
      }

      return updatedData; // Return the modified data
    });
  };
};

// Helpers functions

const updateArrayItems = <T extends Item>(items: T[], dataItems: T[], action: QueryDataActions) => {
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

const updateItem = <T extends Item>(prevItem: T, newItem: T, action: QueryDataActions) => {
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

const changeInfiniteQueryData = (queryKey: QueryKey, items: Item[], action: QueryDataActions) => {
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
