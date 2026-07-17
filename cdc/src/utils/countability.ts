import { isUnpublishedDraft } from 'shared';
import type { RowData } from '../types';

/**
 * The countable set: rows that participate in `e:` counters and `li:`/`lu:` activity
 * stamps: live (not soft-deleted) AND published (draft lifecycle, see
 * `shared/src/published-rows.ts`). Tables without either column are always in the set
 * for that dimension. Counter recalculation applies the same two predicates in SQL
 * (`recalculate-counters.ts`); CDC and recalculation must agree or counters drift on
 * every repair.
 */
export function isCountableRow(row: RowData): boolean {
  return row.deletedAt == null && !isUnpublishedDraft(row);
}

/**
 * True when an UPDATE publishes a draft: `publishedAt` was null on the old row and is
 * set on the new row. Counters and `li:` stamps fire when the row becomes public.
 * Strict `=== null` on the old side ensures tables without the column
 * (`undefined`) never match.
 */
export function isPublishTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.publishedAt === null && newRow.publishedAt != null;
}

/**
 * True when an UPDATE retracts a published row back to draft, the inverse of
 * `isPublishTransition`. Count deltas treat it as a delete so retracted rows stop
 * counting (recalculation counts published rows only; CDC must agree).
 */
export function isUnpublishTransition(newRow: RowData, oldRow: RowData | null | undefined): boolean {
  return oldRow != null && oldRow.publishedAt != null && newRow.publishedAt === null;
}
