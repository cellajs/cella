import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';

interface Item {
  id: string;
}

// This hook is used to mutate the data of a query
const useMutateQueryData = (queryKey: QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<
      InfiniteData<{
        items: Item[];
        total: number;
      }>
    >(queryKey, (data) => {
      if (!data) {
        return;
      }
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
        return {
          pages: [
            {
              items: data.pages[0].items.map((item) => {
                const updatedItem = items.find((items) => items.id === item.id);
                if (item.id === updatedItem?.id) {
                  return updatedItem;
                }

                return item;
              }),
              total: data.pages[0].total,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'delete') {
        return {
          pages: [
            {
              items: data.pages[0].items.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id)),
              total: data.pages[0].total - 1,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }
    });
  };
};

export default useMutateQueryData;
