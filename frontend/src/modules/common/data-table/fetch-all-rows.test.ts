import { describe, expect, it, vi } from 'vitest';
import type { PageRequest } from '~/query/basic/fetch-all-pages';
import { exportChunkSize, fetchAllRows } from './fetch-all-rows';

/** The backend's largest page (`pageSizeCap` in backend/src/schemas/common-schemas.ts): a larger `maxPageSize` reads this many. */
const backendPageSizeCap = 1000;

/** A list endpoint over `rows` whose `totalSize` reports `reportedTotal`, as a counter that trails the list does. */
const listEndpoint = (rows: { id: string }[], reportedTotal = rows.length) =>
  vi.fn(async ({ maxPageSize, skip = 0, pageToken }: PageRequest) => {
    const offset = (pageToken ? Number(pageToken) : 0) + skip;
    const results = rows.slice(offset, offset + Math.min(maxPageSize, backendPageSizeCap));
    const next = offset + results.length;
    return { results, totalSize: reportedTotal, ...(next < rows.length && { nextPageToken: String(next) }) };
  });

describe('fetchAllRows', () => {
  it('exports every row once, in order, in pages the backend reads whole', async () => {
    // More than one page, an exact page multiple and a single short page.
    for (const total of [exportChunkSize * 2 + 500, exportChunkSize, 1]) {
      const all = Array.from({ length: total }, (_, i) => ({ id: `row-${i}` }));
      const fetchPage = listEndpoint(all);

      expect(await fetchAllRows(fetchPage)).toEqual(all);
      expect(fetchPage.mock.calls.every(([{ maxPageSize }]) => maxPageSize <= backendPageSizeCap)).toBe(true);
    }
  });

  // An organization-wide product list counts from a counter that can trail its rows (`productListResponseSchema`).
  it('reads on past a total that trails the list', async () => {
    const all = Array.from({ length: exportChunkSize * 3 }, (_, i) => ({ id: `row-${i}` }));
    expect(await fetchAllRows(listEndpoint(all, exportChunkSize + 1))).toEqual(all);
  });
});
