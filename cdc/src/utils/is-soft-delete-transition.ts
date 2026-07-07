import type { RowData } from '../types';

/**
 * True when an UPDATE flips a row from live to soft-deleted — i.e. `deletedAt`
 * was null on the old row and is set on the new row.
 *
 * Shared by the update handler, count deltas, and embedding cleanup so the
 * soft-delete definition lives in exactly one place.
 */
export function isSoftDeleteTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.deletedAt == null && newRow.deletedAt != null;
}
