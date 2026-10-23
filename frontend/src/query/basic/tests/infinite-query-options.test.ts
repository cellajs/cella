import '~/query/tests/query-client-env';
import { describe, expect, it } from 'vitest';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import type { PageParams, QueryData } from '~/query/types';

const { getNextPageParam } = baseInfiniteQueryOptions;

const page = (count: number, total: number): QueryData<unknown> => ({ items: Array.from({ length: count }, (_, i) => i), total });

const next = (pages: QueryData<unknown>[]): PageParams | undefined | null => getNextPageParam(pages[pages.length - 1], pages);

describe('baseInfiniteQueryOptions.getNextPageParam', () => {
  it('pages on from the rows fetched, and stops once every row is fetched or a page comes back empty, whatever the total claims', () => {
    expect(next([page(40, 100), page(40, 100)])).toEqual({ page: 2, offset: 80 });
    expect(next([page(40, 100), page(40, 100), page(20, 100)])).toBeUndefined();
    // Regression: a stale denormalized total (server counter > real rows) kept requesting the
    // same offset in an unthrottled loop until the rate limiter blocked the user.
    expect(next([page(5, 10), page(0, 10)])).toBeUndefined();
  });
});
