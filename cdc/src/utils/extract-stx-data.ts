import type { StxBase } from 'sdk/types.gen';
import type { RowData } from '../types';

/** Product entities carry a stx JSONB column, channel entities do not; @returns null when absent or malformed. */
export function extractStxData(row: RowData): StxBase | null {
  const stx = row.stx;

  if (!stx) return null;
  if (typeof stx !== 'object' || Array.isArray(stx)) return null;

  const stxObj = stx as Record<string, unknown>;

  if (typeof stxObj.mutationId !== 'string' || typeof stxObj.sourceId !== 'string') {
    return null;
  }

  return {
    mutationId: stxObj.mutationId,
    sourceId: stxObj.sourceId,
    fieldTimestamps:
      typeof stxObj.fieldTimestamps === 'object' && stxObj.fieldTimestamps !== null ? (stxObj.fieldTimestamps as Record<string, string>) : {},
  };
}

/**
 * The fields an edit through the API changed, as the row's stx lists them.
 * @returns null when stx carries no changedFields: creates, non-API updates, rows written before stx.
 */
export function getStxChangedFields(row: RowData): string[] | null {
  const stx = row.stx;
  if (stx && typeof stx === 'object' && !Array.isArray(stx)) {
    const changedFields = (stx as Record<string, unknown>).changedFields;
    if (Array.isArray(changedFields)) return changedFields.filter((field): field is string => typeof field === 'string');
  }
  return null;
}
