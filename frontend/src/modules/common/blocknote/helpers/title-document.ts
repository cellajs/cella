// Title documents: block 0 of a stored description is its title. Editors seed it from a template and label it with
// `titlePlaceholder`, nothing enforces it, and both sides read the title with `titleFromDocument` (shared/blocknote).
import { getInlineTextFromBlock, parseBlocks } from 'shared/blocknote';
import type { CustomBlock, TitleLevel } from '~/modules/common/blocknote/types';

/**
 * Matches backend maxLength.field (backend/src/db/utils/constraints.ts): name column limit.
 * @public
 */
export const TITLE_MAX_LENGTH = 255;

type LooseBlock = { type: string; props?: Record<string, unknown>; content?: unknown; children?: LooseBlock[] };

/** True when a block renders nothing: no text, no children, and not a media/void block. */
const isEmptyTextBlock = (block: LooseBlock): boolean => Array.isArray(block.content) && !getInlineTextFromBlock(block) && !block.children?.length;

const titleBlock = (name: string, level: TitleLevel) =>
  ({
    type: 'heading',
    props: { level },
    content: name ? [{ type: 'text', text: name, styles: {} }] : [],
  }) as unknown as CustomBlock;

/** A stringified single empty title block, the sync seed for create forms. */
export const emptyTitleDocument = (level: TitleLevel = 1) => JSON.stringify([titleBlock('', level)]);

/**
 * A stringified title document seeded with `name`, for forms that open pre-titled.
 * @public
 */
export const seededTitleDocument = (name: string, level: TitleLevel = 1) => JSON.stringify([titleBlock(name, level)]);

/**
 * Pure split of parsed blocks: block 0 text → name, the rest (sans trailing empties) → body. A block 0 without
 * inline content (an image moved to the top) holds no title, so it stays in the body.
 */
export const splitTitleBlocks = (blocks: LooseBlock[]): { name: string; body: LooseBlock[] } => {
  const [first, ...rest] = blocks;
  const body = first && !Array.isArray(first.content) ? [first, ...rest] : rest;
  while (body.length && isEmptyTextBlock(body[body.length - 1])) body.pop();
  return { name: getInlineTextFromBlock(first), body };
};

/**
 * Drops the trailing empty blocks the editor leaves behind before the document is stored. Block 0 is
 * kept whatever its state: an entity without a title yet still needs its title block to edit into.
 * @public
 */
export const trimTitleDocument = (strBlocks: string): string => {
  const blocks = JSON.parse(strBlocks) as LooseBlock[];
  const [first, ...rest] = blocks;
  while (rest.length && isEmptyTextBlock(rest[rest.length - 1])) rest.pop();
  return JSON.stringify([first, ...rest]);
};

/** True when the document carries more than its title, so a create form can tell an empty body apart. */
export const titleDocumentHasBody = (strBlocks: string): boolean => splitTitleBlocks(parseBlocks(strBlocks) ?? []).body.length > 0;
