import type { ProductEntityType } from 'shared';

/** Who stamps an edit and when the edit was made: a replayed edit keeps its intent time. */
export interface EditStamp {
  sourceId: string;
  intentMs: number;
  /** HLC counter within `intentMs`; 0 when unset. */
  counter?: number;
  /** A queued offline edit sent now. The server arbitrates it by its stamp: it loses to a later edit made elsewhere. */
  replayed?: boolean;
}

/**
 * The product a sync scenario edits and reads, and how. The template's is the attachment (`attachmentProduct`); an app
 * runs the sync scenarios on its own product with a scenario file that passes its entry.
 */
export interface BenchProduct {
  type: ProductEntityType;
  /** The text field an edit writes and a reader compares with the database's column of the same name, snake-cased. */
  field: string;
  /** Seeded rows of the bench organization, indexed from 0. */
  total: number;
  rowId(index: number): string;
  /** The list route under an organization path: range reads and paging go there. */
  listPath(orgPath: string): string;
  /** A PATCH that sets `field` of seeded row `index` to `value`. */
  edit(index: number, value: string, stamp: EditStamp): { path: string; json: object; mutationId: string };
}
