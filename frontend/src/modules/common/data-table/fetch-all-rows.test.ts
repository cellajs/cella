import { describe, expect, it, vi } from 'vitest';
import { EXPORT_CHUNK_SIZE, fetchAllRows } from './fetch-all-rows';

/** `limitMax` of the backend's pagination schema (backend/src/schemas/common-schemas.ts): a larger page is rejected. */
const backendLimitMax = 1000;

describe('fetchAllRows', () => {
  it('exports every row in pages the backend accepts, stopping at the first short page', async () => {
    // More than one page, an exact page multiple (an empty last page ends it) and a single short page.
    for (const total of [EXPORT_CHUNK_SIZE + 500, EXPORT_CHUNK_SIZE, 1]) {
      const all = Array.from({ length: total }, (_, i) => ({ id: `row-${i}` }));
      const fetchRows = vi.fn(async (limit: number, offset: number) => all.slice(offset, offset + limit));

      expect(await fetchAllRows(fetchRows)).toEqual(all);
      expect(fetchRows).toHaveBeenCalledTimes(Math.floor(total / EXPORT_CHUNK_SIZE) + 1);
      expect(fetchRows.mock.calls.every(([limit]) => limit <= backendLimitMax)).toBe(true);
    }
  });
});
