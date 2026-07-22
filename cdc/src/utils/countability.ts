import { isUnpublishedDraft } from 'shared';
import type { RowData } from '../types';

/**
 * Returns whether a row participates in entity counters and activity stamps.
 * CDC and SQL recalculation both require live, published rows; retaining the publication
 * check here also covers unfiltered channel rows.
 */
export function isCountableRow(row: RowData): boolean {
  return row.deletedAt == null && !isUnpublishedDraft(row);
}
