import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';

interface Item {
  id: string;
  membership?: { id: string } | null;
}

const updateItems = (items: Item[], dataItems: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
  switch (action) {
    case 'create':
      return [...items, ...dataItems];
    case 'update':
      return dataItems.map((item) => items.find((i) => i.id === item.id) || item);
    case 'delete':
      return dataItems.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id));
    case 'updateMembership':
      return dataItems.map((item) => {
        const updatedItem = items.find((i) => item.membership && i.id === item.membership.id);
        return updatedItem ? { ...item, membership: { ...item.membership, ...updatedItem } } : item;
      });
  }
};

export const useMutateQueryData = (queryKey: QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
    queryClient.setQueryData<{ items: Item[]; total: number }>(queryKey, (data) => {
      if (!data) return;
      const updatedItems = updateItems(items, data.items, action);
      const totalAdjustment = action === 'create' ? items.length : action === 'delete' ? -items.length : 0;
      return { items: updatedItems, total: data.total + totalAdjustment };
    });
  };
};

export const useMutateInfiniteQueryData = (queryKey: QueryKey, invalidateKeyGetter?: (item: Item) => QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
    queryClient.setQueryData<InfiniteData<{ items: Item[]; total: number }>>(queryKey, (data) => {
      if (!data) return;
      const pages = data.pages.map((page, idx) => ({
        items: idx === 0 && action === 'create' ? updateItems(items, page.items, action) : updateItems(items, page.items, action),
        total: action === 'create' && idx === 0 ? page.total + items.length : page.total,
      }));

      return { pages, pageParams: data.pageParams };
    });

    if (invalidateKeyGetter) {
      for (const index in items) {
        const queryKeyToInvalidate = invalidateKeyGetter(items[index]);
        queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      }
    }
  };
};
