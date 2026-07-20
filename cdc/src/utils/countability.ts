import { isUnpublishedDraft } from 'shared';
import type { RowData } from '../types';

/**
 * The countable set: rows that participate in `e:` counters and `li:`/`lu:` activity
 * stamps: live (not soft-deleted) AND published (draft lifecycle, see
 * `shared/src/published-rows.ts`). Tables without either column are always in the set
 * for that dimension. Counter recalculation applies the same two predicates in SQL
 * (`recalculate-counters.ts`); CDC and recalculation must agree or counters drift on
 * every repair.
 *
 * For PRODUCT tables the published dimension is normally settled upstream: the
 * publication row filter keeps drafts out of the stream (parse-message.ts guards the
 * misconfig case). It stays part of the definition here because CHANNEL tables
 * carry `publishedAt` unfiltered (invitee gating), and recalculation counts published
 * rows only for both.
 */
export function isCountableRow(row: RowData): boolean {
  return row.deletedAt == null && !isUnpublishedDraft(row);
}
