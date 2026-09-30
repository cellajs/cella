import { getSearchableTextFromBlocks, getTextFromBlock, parseBlocks } from 'shared/blocknote';
import { maxLength } from '#/db/utils/constraints';

/**
 * For entities whose `description` stores the whole edited document as BlockNote blocks, block 0
 * holds the title. `name` is then a denormalized column derived on every write; a Yjs
 * materialization goes through the same update op and gets the same treatment.
 */

/**
 * Title text of a stored document: block 0's plain text, whatever its block type. It is clamped to the `name`
 * column so autosave and Yjs materialize writes, which have no user to report to, never fail on length. Empty when
 * the document is unparseable or starts with a block without text (an image); the caller then keeps the previous
 * name.
 */
export const nameFromDocument = (description: string | null | undefined): string => {
  const [first] = parseBlocks(description) ?? [];
  return first ? getTextFromBlock(first).trim().slice(0, maxLength.field).trim() : '';
};

/** Search text for a stored document, capped at 900 characters. Block 0 already carries the title, so it is not prepended. */
export const keywordsFromDocument = (description: string | null | undefined): string =>
  getSearchableTextFromBlocks(parseBlocks(description) ?? [])
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
