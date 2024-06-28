import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';

interface Item {
  id: string;
  membership?: { id: string } | null;
}

// This hook is used to mutate the data of a query
export const useMutateQueryData = (queryKey: QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
    queryClient.setQueryData<{
      items: Item[];
      total: number;
    }>(queryKey, (data) => {
      if (!data) return;

      if (action === 'create') {
        return {
          items: [...items, ...data.items],
          total: data.total + items.length,
        };
      }

      if (action === 'update') {
        return {
          items: data.items.map((item) => {
            const updatedItem = items.find((items) => items.id === item.id);
            if (item.id === updatedItem?.id) {
              return updatedItem;
            }
            return item;
          }),
          total: data.total,
        };
      }

      if (action === 'delete') {
        const updatedItems = data.items.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id));
        const updatedTotal = data.total - (data.items.length - updatedItems.length);
        return {
          items: updatedItems,
          total: updatedTotal,
        };
      }

      if (action === 'updateMembership') {
        return {
          items: data.items.map((item) => {
            const updatedItem = items.find((items) => item.membership && items.id === item.membership.id);
            if (item.membership && item.membership.id === updatedItem?.id) {
              return { ...item, membership: { ...item.membership, ...updatedItem } };
            }
            return item;
          }),
          total: data.total,
        };
      }
    });
  };
};

// This hook is used to mutate the data of an infinite query
export const useMutateInfiniteQueryData = (queryKey: QueryKey, invalidateKeyGetter?: (item: Item) => QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
    queryClient.setQueryData<
      InfiniteData<{
        items: Item[];
        total: number;
      }>
    >(queryKey, (data) => {
      if (!data) return;
      if (action === 'create') {
        return {
          pages: [
            {
              items: [...items, ...data.pages[0].items],
              total: data.pages[0].total + items.length,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'update') {
        const updatedPages = data.pages.map((page) => {
          return {
            items: page.items.map((item) => {
              const updatedItem = items.find((items) => items.id === item.id);
              if (item.id === updatedItem?.id) return updatedItem;
              return item;
            }),
            total: page.total,
          };
        });

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'delete') {
        const updatedPages = data.pages.map((page) => {
          const updatedItems = page.items.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id));
          const updatedTotal = page.total - (page.items.length - updatedItems.length);
          return {
            items: updatedItems,
            total: updatedTotal,
          };
        });

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'updateMembership') {
        const updatedPages = data.pages.map((page) => {
          return {
            items: page.items.map((item) => {
              const updatedItem = items.find((items) => item.membership && items.id === item.membership.id);
              if (item.membership && item.membership.id === updatedItem?.id) {
                return { ...item, membership: { ...item.membership, ...updatedItem } };
              }
              return item;
            }),
            total: page.total,
          };
        });

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }
    });

    if (invalidateKeyGetter) {
      for (const item of items) {
        queryClient.invalidateQueries({
          queryKey: invalidateKeyGetter(item),
        });
      }
    }
  };
};
