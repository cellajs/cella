import type { QueryKey } from '@tanstack/react-query';
import { getQueryItems, isInfiniteQueryData, mapListItems } from '~/query/basic/mutate-query';
import type { ItemData, QueryDataActions } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem } from '~/query/types';
import { getQueryKeySortOrder } from './get-query-key-sort-order';

/**
 * Applies create, update or remove to list data. Totals move only by rows that enter or leave, so a partial overlap
 * cannot drift them; new rows enter one page, the first when `insertOrder` lists newest first, else the last.
 */
const changeListItems = (data: BaseQueryItem<ItemData>, items: ItemData[], action: QueryDataActions, insertOrder?: 'asc' | 'desc') => {
  const cachedIds = new Set(getQueryItems(data).map(({ id }) => id));
  const changedItems = items.filter(({ id }) => (action === 'create' ? !cachedIds.has(id) : cachedIds.has(id)));
  if (!changedItems.length) return data;

  if (action === 'create') {
    const insertPage = insertOrder === 'asc' && isInfiniteQueryData(data) ? data.pages.length - 1 : 0;
    return mapListItems(
      data,
      (pageItems, index) => (index === insertPage ? updateArrayItems(pageItems, changedItems, action, insertOrder) : pageItems),
      changedItems.length,
    );
  }

  const changedIds = new Set(changedItems.map(({ id }) => id));
  return mapListItems(
    data,
    (pageItems) => (pageItems.some(({ id }) => changedIds.has(id)) ? updateArrayItems(pageItems, items, action) : pageItems),
    action === 'remove' ? -changedItems.length : 0,
  );
};

/** Applies create, update or remove to the list cached under `queryKey`: a paged list inserts new rows in the key's createdAt order, a flat list prepends them. */
export function changeListData(queryKey: QueryKey, items: ItemData[], action: QueryDataActions): void {
  queryClient.setQueryData<BaseQueryItem<ItemData>>(
    queryKey,
    (data) => data && changeListItems(data, items, action, isInfiniteQueryData(data) ? getQueryKeySortOrder(queryKey) : undefined),
  );
}

// Apply create/update/remove to an items array, optionally inserting new items in `insertOrder`.
const updateArrayItems = <T extends ItemData>(items: T[], dataItems: T[], action: QueryDataActions, insertOrder?: 'asc' | 'desc') => {
  switch (action) {
    case 'create':
      return insertOrder === 'asc' ? [...items, ...dataItems] : [...dataItems, ...items];

    case 'update': {
      const updates = new Map(dataItems.map((i) => [i.id, i]));
      return items.map((item) => updates.get(item.id) ?? item);
    }

    case 'remove': {
      const deleteIds = new Set(dataItems.map(({ id }) => id));
      return items.filter((item) => !deleteIds.has(item.id));
    }
  }
};
