import { describe, expect, it, vi } from 'vitest';
import { EXPORT_CHUNK_SIZE, fetchAllRows } from './fetch-all-rows';

describe('fetchAllRows', () => {
  it('exports a result set larger than one chunk completely (no silent 1000-row cap)', async () => {
    const total = EXPORT_CHUNK_SIZE + 500;
    const all = Array.from({ length: total }, (_, i) => ({ id: `row-${i}` }));
    const fetchRows = vi.fn(async (limit: number, offset: number) => all.slice(offset, offset + limit));

    const rows = await fetchAllRows(fetchRows);

    expect(rows).toHaveLength(total);
    expect(rows[total - 1]).toEqual({ id: `row-${total - 1}` });
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(fetchRows).toHaveBeenNthCalledWith(1, EXPORT_CHUNK_SIZE, 0);
    expect(fetchRows).toHaveBeenNthCalledWith(2, EXPORT_CHUNK_SIZE, EXPORT_CHUNK_SIZE);
  });

  it('stops after one fetch when everything fits in a single chunk', async () => {
    const fetchRows = vi.fn(async () => [{ id: 'only' }]);

    const rows = await fetchAllRows(fetchRows);

    expect(rows).toEqual([{ id: 'only' }]);
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });

  it('handles an exact chunk-multiple result set (final empty chunk terminates)', async () => {
    const all = Array.from({ length: EXPORT_CHUNK_SIZE }, (_, i) => ({ id: `row-${i}` }));
    const fetchRows = vi.fn(async (limit: number, offset: number) => all.slice(offset, offset + limit));

    const rows = await fetchAllRows(fetchRows);

    expect(rows).toHaveLength(EXPORT_CHUNK_SIZE);
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });
});
