import { isUnpublishedDraft } from 'shared';
import type { RowData } from '../types';

/** Only live, published rows participate in entity counters and activity stamps. */
export function isCountableRow(row: RowData): boolean {
  return row.deletedAt == null && !isUnpublishedDraft(row);
}
