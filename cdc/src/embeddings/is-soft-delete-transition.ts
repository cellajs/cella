import type { RowData } from '../types';

/** Whether an update soft-deleted its row: `deletedAt` went from empty to set. */
export function isSoftDeleteTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.deletedAt == null && newRow.deletedAt != null;
}
