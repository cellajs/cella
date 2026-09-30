import '~/query/tests/query-client-env';
import { describe, expect, it } from 'vitest';
import { formatUpdatedCacheData } from '~/query/basic/mutate-query';
import type { InfiniteQueryData } from '~/query/types';

type Item = { id: string };

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));

const infinite = (pages: Item[][], total: number): InfiniteQueryData<Item> => ({
  pages: pages.map((pageItems) => ({ items: pageItems, total })),
  pageParams: pages.map((_, i) => ({ page: i, offset: pages.slice(0, i).flat().length })),
});

describe('formatUpdatedCacheData', () => {
  // A refetch of an infinite query starts from pageParams[0]; a non-zero first offset skips page one.
  it('keeps the first page at offset 0 so a refetch starts at the top', () => {
    const prev = infinite([items('a', 'b')], 2);

    const next = formatUpdatedCacheData(prev, items('a', 'b'), 20) as InfiniteQueryData<Item>;

    expect(next.pageParams).toEqual([{ page: 0, offset: 0 }]);
  });

  it('gives every page the offset of the items before it', () => {
    const prev = infinite([items('a', 'b'), items('c', 'd'), items('e')], 5);

    const next = formatUpdatedCacheData(prev, items('a', 'b', 'c', 'd', 'e'), 2) as InfiniteQueryData<Item>;

    expect(next.pageParams).toEqual([
      { page: 0, offset: 0 },
      { page: 1, offset: 2 },
      { page: 2, offset: 4 },
    ]);
    expect(next.pages.map((p) => p.items.map((i) => i.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('re-chunks after a removal and adjusts the total on every page', () => {
    const prev = infinite([items('a', 'b'), items('c', 'd')], 4);

    const next = formatUpdatedCacheData(prev, items('a', 'c', 'd'), 2, -1) as InfiniteQueryData<Item>;

    expect(next.pageParams).toEqual([
      { page: 0, offset: 0 },
      { page: 1, offset: 2 },
    ]);
    expect(next.pages.map((p) => p.total)).toEqual([3, 3]);
  });
});
