import '~/query/tests/query-client-env';
import type { QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData, QueryData } from '~/query/types';

type Row = ItemData & { name?: string };

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));
const named = (id: string, name: string): Row[] => [{ id, name }];
const ids = (items: Row[]) => items.map((row) => row.id);

const flatKey: QueryKey = ['task', 'list', 'org-1', 'org-1'];
const newestFirstKey: QueryKey = ['task', 'list', { sort: 'createdAt', order: 'desc' }];
const oldestFirstKey: QueryKey = ['task', 'list', { sort: 'createdAt', order: 'asc' }];

const infinite = (pages: Row[][], total: number): InfiniteQueryData<Row> => ({
  pages: pages.map((items) => ({ items, total })),
  pageParams: pages.map((_, i) => ({ page: i, offset: pages.slice(0, i).flat().length })),
});

const readFlat = (key: QueryKey) => queryClient.getQueryData<QueryData<Row>>(key);
const readInfinite = (key: QueryKey) => queryClient.getQueryData<InfiniteQueryData<Row>>(key);

afterEach(() => queryClient.clear());

describe('changeQueryData (flat)', () => {
  const seed = () => {
    queryClient.setQueryData(flatKey, { items: rows('a', 'b'), total: 2 });
    return readFlat(flatKey);
  };

  it('create miss: prepends the new row whatever the key sort and counts it', () => {
    queryClient.setQueryData(oldestFirstKey, { items: rows('a'), total: 1 });

    changeQueryData(oldestFirstKey, rows('c'), 'create');

    expect(readFlat(oldestFirstKey)).toEqual({ items: rows('c', 'a'), total: 2 });
  });

  it('create hit: keeps the data object when every row is cached', () => {
    const before = seed();

    changeQueryData(flatKey, rows('a'), 'create');

    expect(readFlat(flatKey)).toBe(before);
  });

  it('create with partial overlap: adds and counts only the rows not cached', () => {
    seed();

    changeQueryData(flatKey, rows('b', 'c'), 'create');

    expect(readFlat(flatKey)).toEqual({ items: rows('c', 'a', 'b'), total: 3 });
  });

  it('update hit: replaces the matching row and keeps the others and the total', () => {
    const before = seed();

    changeQueryData(flatKey, named('b', 'renamed'), 'update');

    const after = readFlat(flatKey);
    expect(after?.items).toEqual([{ id: 'a' }, { id: 'b', name: 'renamed' }]);
    expect(after?.items[0]).toBe(before?.items[0]);
    expect(after?.total).toBe(2);
  });

  it('update miss: keeps the data object', () => {
    const before = seed();

    changeQueryData(flatKey, named('x', 'nope'), 'update');

    expect(readFlat(flatKey)).toBe(before);
  });

  it('remove hit: drops the row and counts only rows that were cached', () => {
    seed();

    changeQueryData(flatKey, rows('a', 'x'), 'remove');

    expect(readFlat(flatKey)).toEqual({ items: rows('b'), total: 1 });
  });

  it('remove miss: keeps the data object', () => {
    const before = seed();

    changeQueryData(flatKey, rows('x'), 'remove');

    expect(readFlat(flatKey)).toBe(before);
  });

  it('does nothing for an uncached key', () => {
    changeQueryData(flatKey, rows('a'), 'create');

    expect(readFlat(flatKey)).toBeUndefined();
  });
});

describe('changeInfiniteQueryData', () => {
  const twoPages = () => {
    queryClient.setQueryData(newestFirstKey, infinite([rows('a', 'b'), rows('c')], 3));
    return readInfinite(newestFirstKey);
  };

  it('create miss: prepends on a newest-first key and adds to the total', () => {
    queryClient.setQueryData(newestFirstKey, infinite([rows('a', 'b')], 2));

    changeInfiniteQueryData(newestFirstKey, rows('c'), 'create');

    expect(readInfinite(newestFirstKey)).toEqual(infinite([rows('c', 'a', 'b')], 3));
  });

  it('create miss: appends on an oldest-first key', () => {
    queryClient.setQueryData(oldestFirstKey, infinite([rows('a', 'b')], 2));

    changeInfiniteQueryData(oldestFirstKey, rows('c'), 'create');

    expect(ids(readInfinite(oldestFirstKey)?.pages[0].items ?? [])).toEqual(['a', 'b', 'c']);
  });

  it('create miss: a key without createdAt sort inserts newest first', () => {
    const key = ['task', 'list', { sort: 'name', order: 'asc' }];
    queryClient.setQueryData(key, infinite([rows('a')], 1));

    changeInfiniteQueryData(key, rows('b'), 'create');

    expect(ids(readInfinite(key)?.pages[0].items ?? [])).toEqual(['b', 'a']);
  });

  it('create hit: keeps the data object when the row is cached', () => {
    queryClient.setQueryData(newestFirstKey, infinite([rows('a', 'b')], 2));
    const before = readInfinite(newestFirstKey);

    changeInfiniteQueryData(newestFirstKey, rows('b'), 'create');

    expect(readInfinite(newestFirstKey)).toBe(before);
  });

  it('update hit: replaces the row on its page and keeps the other page, the totals and page params', () => {
    const before = twoPages();

    changeInfiniteQueryData(newestFirstKey, named('c', 'renamed'), 'update');

    const after = readInfinite(newestFirstKey);
    expect(after?.pages[1].items).toEqual([{ id: 'c', name: 'renamed' }]);
    expect(after?.pages[0]).toBe(before?.pages[0]);
    expect(after?.pages.map((page) => page.total)).toEqual([3, 3]);
    expect(after?.pageParams).toEqual(before?.pageParams);
  });

  it('update miss: keeps the data object', () => {
    const before = twoPages();

    changeInfiniteQueryData(newestFirstKey, named('x', 'nope'), 'update');

    expect(readInfinite(newestFirstKey)).toBe(before);
  });

  it('remove hit: drops the row from its page and lowers the total on every page', () => {
    const before = twoPages();

    changeInfiniteQueryData(newestFirstKey, rows('b', 'x'), 'remove');

    const after = readInfinite(newestFirstKey);
    expect(after?.pages.map((page) => ids(page.items))).toEqual([['a'], ['c']]);
    expect(after?.pages.map((page) => page.total)).toEqual([2, 2]);
    expect(after?.pageParams).toEqual(before?.pageParams);
  });

  it('remove miss: keeps the data object', () => {
    const before = twoPages();

    changeInfiniteQueryData(newestFirstKey, rows('x'), 'remove');

    expect(readInfinite(newestFirstKey)).toBe(before);
  });

  it('does nothing for an uncached key', () => {
    changeInfiniteQueryData(newestFirstKey, rows('a'), 'create');

    expect(readInfinite(newestFirstKey)).toBeUndefined();
  });
});
