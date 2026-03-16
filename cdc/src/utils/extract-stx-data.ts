import type { StxBase } from '#/schemas/sync-transaction-schemas';
import type { RowData } from './convert-row-keys';

/**
 * Extract stx (sync transaction metadata) from a row if present.
 * Product entities have a stx JSONB column, context entities do not.
 * Returns null if stx is not present or is not a valid object.
 */
export function extractStxData(row: RowData): StxBase | null {
  const stx = row.stx;

  // Not present or null
  if (!stx) return null;

  // Must be an object with required fields
  if (typeof stx !== 'object' || Array.isArray(stx)) return null;

  const stxObj = stx as Record<string, unknown>;

  // Validate required fields
  if (typeof stxObj.mutationId !== 'string' || typeof stxObj.sourceId !== 'string') {
    return null;
  }

  return {
    mutationId: stxObj.mutationId,
    sourceId: stxObj.sourceId,
    fieldTimestamps: (typeof stxObj.fieldTimestamps === 'object' && stxObj.fieldTimestamps !== null)
      ? stxObj.fieldTimestamps as Record<string, string>
      : {},
  };
}
