import { deriveDocument } from 'shared/utils/derive-description-core';
import { maxLength } from '#/db/utils/constraints';

/**
 * For entities whose `description` stores the whole edited document as BlockNote blocks, block 0
 * holds the title. `name` is then a denormalized column derived on every write; a Yjs
 * materialization goes through the same update op and gets the same treatment.
 */

/**
 * `name` for a stored title document: the title `deriveDocument` reads (`titleFromDocument`), clamped to the column so
 * autosave and Yjs materialize writes, which have no user to report to, never fail on length. Empty when block 0 holds
 * no text (an image); the caller then keeps the previous name.
 */
export const nameFromDocument = (description: string | null | undefined): string =>
  deriveDocument(description).name.slice(0, maxLength.field).trim();

/** Search text for a stored document, capped at 900 characters. Block 0 already carries the title, so it is not prepended. One field of `deriveDocument`. */
export const keywordsFromDocument = (description: string | null | undefined): string =>
  deriveDocument(description).keywords;
