import type { Column, SQL } from 'drizzle-orm';
import { gte, lte } from 'drizzle-orm';

/**
 * One format: "51,150" is the inclusive range { gte: 51, lte: 150 }. Every consumer knows its upper bound:
 * catchup takes the view answer's frontier, live takes the notification's batch end.
 */
export function parseSeqCursor(raw: string | undefined): { gte?: number; lte?: number } | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map(Number);
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
