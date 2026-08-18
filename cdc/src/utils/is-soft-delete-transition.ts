import type { RowData } from '../types';

/** The single soft-delete definition, shared by the update handler, count deltas, and embedding cleanup. */
export function isSoftDeleteTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.deletedAt == null && newRow.deletedAt != null;
}

/** Inverse of `isSoftDeleteTransition`; count deltas treat it as a create so recalculation agrees. */
export function isRestoreTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.deletedAt != null && newRow.deletedAt == null;
}
