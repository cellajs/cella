import { deriveDocument } from 'shared/utils/derive-description-core';

/**
 * For entities whose `description` stores the whole edited document as BlockNote blocks, block 0
 * holds the title. `name` is then a denormalized column derived on every write, so the two cannot
 * disagree; a Yjs materialization goes through the same update op and gets the same treatment.
 */

/** Title text of a stored document: block 0's plain text. Empty when the document is unparseable. One field of `deriveDocument`. */
export const nameFromDocument = (description: string | null | undefined): string => deriveDocument(description).name;

/** Search text for a stored document, capped at 900 characters. Block 0 already carries the title, so it is not prepended. One field of `deriveDocument`. */
export const keywordsFromDocument = (description: string | null | undefined): string =>
  deriveDocument(description).keywords;
