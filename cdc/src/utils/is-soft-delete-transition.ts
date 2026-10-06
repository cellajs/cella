import type { RowData } from '../types';

/** The single soft-delete definition, shared by the update handler, count deltas, and embedding cleanup. */
export function isSoftDeleteTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.deletedAt == null && newRow.deletedAt != null;
}
