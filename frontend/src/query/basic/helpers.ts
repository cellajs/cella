import type { QueryKey } from '@tanstack/react-query';
import type { ChannelBase } from 'sdk';
import type { EntityType } from 'shared';
import { getQueryItems, isInfiniteQueryData, mapListItems } from '~/query/basic/mutate-query';
import type { ArbitraryEntityQueryData, EntityIdAndType, ItemData, QueryDataActions } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem } from '~/query/types';
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

/**
 * Applies create, update or remove to list data. Totals move only by rows that enter or leave, so a partial overlap
 * cannot drift them; new rows enter one page, the first when `insertOrder` lists newest first, else the last.
 */
const changeListItems = (
  data: BaseQueryItem<ItemData>,
  items: ItemData[],
  action: QueryDataActions,
  insertOrder?: 'asc' | 'desc',
) => {
  const cachedIds = new Set(getQueryItems(data).map(({ id }) => id));
  const changedItems = items.filter(({ id }) => (action === 'create' ? !cachedIds.has(id) : cachedIds.has(id)));
  if (!changedItems.length) return data;

  if (action === 'create') {
    const insertPage = insertOrder === 'asc' && isInfiniteQueryData(data) ? data.pages.length - 1 : 0;
    return mapListItems(
      data,
      (pageItems, index) =>
        index === insertPage ? updateArrayItems(pageItems, changedItems, action, insertOrder) : pageItems,
      changedItems.length,
    );
  }

  const changedIds = new Set(changedItems.map(({ id }) => id));
  return mapListItems(
    data,
    (pageItems) =>
      pageItems.some(({ id }) => changedIds.has(id)) ? updateArrayItems(pageItems, items, action) : pageItems,
    action === 'remove' ? -changedItems.length : 0,
  );
};

/** Paged lists insert new rows in the key's createdAt order. */
export const changeInfiniteQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  const { order } = getQueryKeySortOrder(queryKey);
  queryClient.setQueryData<BaseQueryItem<ItemData>>(
    queryKey,
    (data) => data && changeListItems(data, items, action, order),
  );
};

/** Flat lists prepend new rows. */
export const changeQueryData = (queryKey: QueryKey, items: ItemData[], action: QueryDataActions) => {
  queryClient.setQueryData<BaseQueryItem<ItemData>>(queryKey, (data) => data && changeListItems(data, items, action));
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
