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

/**
 * True when an UPDATE flips a row from soft-deleted back to live — the inverse of
 * `isSoftDeleteTransition`. Count deltas treat it as a create so restored rows are
 * counted again (recalculation counts live rows only; CDC must agree).
 */
export function isRestoreTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.deletedAt != null && newRow.deletedAt == null;
}
