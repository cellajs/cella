import type { TxColumnData } from '#/db/utils/product-entity-columns';
import type { RowData } from './convert-row-keys';

/**
 * Extract tx (transaction metadata) from a row if present.
 * Product entities have a tx JSONB column, context entities do not.
 * Returns null if tx is not present or is not a valid object.
 */
export function extractTxData(row: RowData): TxColumnData | null {
  const tx = row.tx;

  // Not present or null
  if (!tx) return null;

  // Must be an object with required fields
  if (typeof tx !== 'object' || Array.isArray(tx)) return null;

  const txObj = tx as Record<string, unknown>;

  // Validate required fields
  if (typeof txObj.transactionId !== 'string' || typeof txObj.sourceId !== 'string') {
    return null;
  }

  return {
    transactionId: txObj.transactionId,
    sourceId: txObj.sourceId,
    changedField: typeof txObj.changedField === 'string' ? txObj.changedField : null,
  };
}
