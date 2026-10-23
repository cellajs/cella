import '~/query/tests/query-client-env';
import type { QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { changeListData } from '~/query/basic/cache-mutations';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData, QueryData } from '~/query/types';

type Row = ItemData & { name?: string };

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));
const ids = (items: Row[]) => items.map((row) => row.id);

const flatKey: QueryKey = ['task', 'list', 'org-1', 'org-1'];
const pagedKey: QueryKey = ['task', 'list', { sort: 'createdAt', order: 'desc' }];

const infinite = (pages: Row[][], total: number): InfiniteQueryData<Row> => ({
  pages: pages.map((items) => ({ items, total })),
  pageParams: pages.map((_, i) => ({ page: i, offset: pages.slice(0, i).flat().length })),
});

afterEach(() => queryClient.clear());

// cacheCreate and cacheRemove of every product module, and the realtime splice, write lists through this one.
describe('changeListData', () => {
  it('lets a row enter a list once, and moves the total only by rows that enter or leave, on every page', () => {
    queryClient.setQueryData(flatKey, { items: rows('a', 'b'), total: 2 });
    queryClient.setQueryData(pagedKey, infinite([rows('a', 'b'), rows('c')], 3));

    // `b` and `c` are cached already, on the first or a later page: only `x` enters, on one page.
    changeListData(flatKey, rows('b', 'x'), 'create');
    changeListData(pagedKey, rows('c', 'x'), 'create');

    expect(queryClient.getQueryData<QueryData<Row>>(flatKey)).toEqual({ items: rows('x', 'a', 'b'), total: 3 });
    const paged = () => queryClient.getQueryData<InfiniteQueryData<Row>>(pagedKey);
    expect(paged()?.pages.map((page) => ids(page.items))).toEqual([['x', 'a', 'b'], ['c']]);
    expect(paged()?.pages.map((page) => page.total)).toEqual([4, 4]);

    // `y` was never cached: a remove counts only the rows that were.
    changeListData(flatKey, rows('a', 'y'), 'remove');
    changeListData(pagedKey, rows('c', 'y'), 'remove');

    expect(queryClient.getQueryData<QueryData<Row>>(flatKey)).toEqual({ items: rows('x', 'b'), total: 2 });
    expect(paged()?.pages.map((page) => ids(page.items))).toEqual([['x', 'a', 'b'], []]);
    expect(paged()?.pages.map((page) => page.total)).toEqual([3, 3]);
  });
});
