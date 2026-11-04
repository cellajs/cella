import { isRecord } from 'shared/utils/as-record';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import type { RowData } from '../types';

/** Product entities carry a stx JSONB column, channel entities do not; @returns null when absent or malformed. */
export function extractStxData(row: RowData): StxBase | null {
  const stx = row.stx;

  if (!isRecord(stx) || typeof stx.mutationId !== 'string' || typeof stx.sourceId !== 'string') return null;

  const timestamps = isRecord(stx.fieldTimestamps) ? Object.entries(stx.fieldTimestamps) : [];
  return {
    mutationId: stx.mutationId,
    sourceId: stx.sourceId,
    fieldTimestamps: Object.fromEntries(timestamps.filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
  };
}
