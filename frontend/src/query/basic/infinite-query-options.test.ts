import { describe, expect, it } from 'vitest';
import type { PageParams, QueryData } from '~/query/types';
import { baseInfiniteQueryOptions } from './infinite-query-options';

const { getNextPageParam } = baseInfiniteQueryOptions;

const page = (count: number, total: number): QueryData<unknown> => ({
  items: Array.from({ length: count }, (_, i) => i),
  total,
});

const next = (pages: QueryData<unknown>[]): PageParams | undefined | null =>
  getNextPageParam(pages[pages.length - 1], pages, { page: 0, offset: 0 }, []);

describe('baseInfiniteQueryOptions.getNextPageParam', () => {
  it('advances offset by the fetched count while rows remain', () => {
    expect(next([page(40, 100)])).toEqual({ page: 1, offset: 40 });
    expect(next([page(40, 100), page(40, 100)])).toEqual({ page: 2, offset: 80 });
  });

  it('stops when every row is fetched', () => {
    expect(next([page(40, 100), page(40, 100), page(20, 100)])).toBeUndefined();
    expect(next([page(0, 0)])).toBeUndefined();
  });

  it('stops on an empty page even when a drifted total claims more rows', () => {
    // Regression: a stale denormalized total (server counter > real rows) kept requesting the
    // same offset in an unthrottled loop until the rate limiter blocked the user.
    expect(next([page(5, 10), page(0, 10)])).toBeUndefined();
    expect(next([page(0, 10)])).toBeUndefined();
  });
});
