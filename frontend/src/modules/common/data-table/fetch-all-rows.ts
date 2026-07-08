/** Rows per export fetch; the backend rejects limits above 1000, so exports page in chunks. */
export const EXPORT_CHUNK_SIZE = 1000;

/**
 * Pages through fetchRows until a short chunk signals the end; a single capped
 * fetch would silently truncate exports at EXPORT_CHUNK_SIZE rows.
 */
export async function fetchAllRows<T>(fetchRows: (limit: number, offset: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const chunk = await fetchRows(EXPORT_CHUNK_SIZE, rows.length);
    rows.push(...chunk);
    if (chunk.length < EXPORT_CHUNK_SIZE) break;
  }
  return rows;
}
