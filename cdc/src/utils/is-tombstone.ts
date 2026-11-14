import type { RowData } from '../types';

/** Whether a product row is a tombstone: soft-deleted, `deletedAt` set. A delete whose row is one is a soft delete. */
export const isTombstone = (row: RowData): boolean => row.deletedAt != null;
