import type { Column, SQL } from 'drizzle-orm';
import { asc, gt, isNull, lte } from 'drizzle-orm';

/** A range read for sync: the rows stamped with a sequence position in (afterSeq, untilSeq]. */
export interface SeqRange {
  afterSeq: number;
  untilSeq: number;
}

/** The range a product list query asks for; `productListQuerySchema` admits both bounds or neither. */
export const seqRangeOf = ({ afterSeq, untilSeq }: { afterSeq?: number; untilSeq?: number }): SeqRange | undefined =>
  afterSeq === undefined || untilSeq === undefined ? undefined : { afterSeq, untilSeq };

interface SyncedTable {
  id: Column;
  seq: Column;
  deletedAt: Column;
}

/**
 * The rows a product list reads, and their order. A range read keeps deleted rows so caches drop them, and orders by seq
 * then id so a capped page is a complete prefix of the range. A normal read hides deleted rows and leaves `orderBy` to
 * the list's own sort. AND each `where` term with the other filters: a bound inside an OR group bounds nothing.
 */
export function seqRangeRead(table: SyncedTable, range: SeqRange | undefined): { where: SQL[]; orderBy?: SQL[] } {
  if (!range) return { where: [isNull(table.deletedAt)] };
  return {
    where: [gt(table.seq, range.afterSeq), lte(table.seq, range.untilSeq)],
    orderBy: [asc(table.seq), asc(table.id)],
  };
}
