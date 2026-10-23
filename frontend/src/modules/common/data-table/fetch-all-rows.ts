/** Rows per export fetch; the backend rejects limits above 1000, so exports page in chunks. */
export const exportChunkSize = 1000;

/** Pages through fetchRows until a short chunk signals the end; one capped fetch would truncate the export. */
export async function fetchAllRows<T>(fetchRows: (limit: number, offset: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const chunk = await fetchRows(exportChunkSize, rows.length);
    rows.push(...chunk);
    if (chunk.length < exportChunkSize) break;
  }
  return rows;
}
