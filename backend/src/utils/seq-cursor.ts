import type { Column, SQL } from 'drizzle-orm';
import { eq, gte, like, lte, or } from 'drizzle-orm';

/**
 * Parse a seqCursor string into gte/lte boundaries.
 *
 * Formats:
 * - "51" maps to { gte: 51 }: open-ended (seq >= 51), used by catchup.
 * - "51,150" maps to { gte: 51, lte: 150 }: bounded range, used by batch notifications.
 */
export function parseSeqCursor(raw: string | undefined): { gte?: number; lte?: number } | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map(Number);
  if (parts.length === 1 && Number.isFinite(parts[0])) return { gte: parts[0] };
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]))
    return { gte: parts[0], lte: parts[1] };
  return undefined;
}

/** Returns Drizzle SQL filters for a seq column based on a seqCursor string. */
export function seqCursorFilters(seqColumn: Column, raw: string | undefined): SQL[] {
  const cursor = parseSeqCursor(raw);
  const filters: SQL[] = [];
  if (cursor?.gte !== undefined) filters.push(gte(seqColumn, cursor.gte));
  if (cursor?.lte !== undefined) filters.push(lte(seqColumn, cursor.lte));
  return filters;
}

/**
 * Segment-safe materialized-path prefix filter: matches the node itself and true
 * descendants (`o1/c1` covers `o1/c1` and `o1/c1/p9`, never `o1/c11`). The permission
 * WHERE is always applied separately; this only narrows placement.
 */
export function pathPrefixFilter(pathColumn: Column, prefix: string | undefined): SQL[] {
  if (!prefix) return [];
  return [
    or(eq(pathColumn, prefix), like(pathColumn, `${prefix.replaceAll('%', '\\%').replaceAll('_', '\\_')}/%`)) as SQL,
  ];
}
