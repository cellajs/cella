import type { Block } from '@blocknote/core';
import { getSearchableTextFromBlocks, getTextFromBlock } from 'shared/blocknote';

/**
 * For entities whose `description` stores the whole edited document as BlockNote blocks, block 0
 * holds the title. `name` is then a denormalized column derived on every write, so the two cannot
 * disagree; a Yjs materialization goes through the same update op and gets the same treatment.
 */
const parseBlocks = (description: string | null | undefined): Block[] => {
  if (!description) return [];
  try {
    const parsed = JSON.parse(description);
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    return [];
  }
};

/** Title text of a stored document: block 0's plain text. Empty when the document is unparseable. */
export const nameFromDocument = (description: string | null | undefined): string => {
  const [first] = parseBlocks(description);
  return first ? getTextFromBlock(first).trim() : '';
};

/** Search text for a stored document, capped at 900 characters. Block 0 already carries the title, so it is not prepended. */
export const keywordsFromDocument = (description: string | null | undefined): string =>
  getSearchableTextFromBlocks(parseBlocks(description)).replace(/\s+/g, ' ').trim().slice(0, 900);
