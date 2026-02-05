import type { TxBase } from '#/schemas/tx-base-schema';
import type { RowData } from './convert-row-keys';

/**
 * Extract tx (transaction metadata) from a row if present.
 * Product entities have a tx JSONB column, context entities do not.
 * Returns null if tx is not present or is not a valid object.
 */
export function extractTxData(row: RowData): TxBase | null {
  const tx = row.tx;

  // Not present or null
  if (!tx) return null;

  // Must be an object with required fields
  if (typeof tx !== 'object' || Array.isArray(tx)) return null;

  const txObj = tx as Record<string, unknown>;

  // Validate required fields for new schema
  if (typeof txObj.id !== 'string' || typeof txObj.sourceId !== 'string' || typeof txObj.version !== 'number') {
    return null;
  }

  return {
    id: txObj.id,
    sourceId: txObj.sourceId,
    version: txObj.version,
    fieldVersions: (typeof txObj.fieldVersions === 'object' && txObj.fieldVersions !== null)
      ? txObj.fieldVersions as Record<string, number>
      : {},
  };
}
