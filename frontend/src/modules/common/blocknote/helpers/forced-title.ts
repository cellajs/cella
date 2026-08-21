// Forced-title helpers: the entity keeps `name` as stored source of truth while the editor shows `[heading(name), ...body]`.
import type { CustomBlock, TitleLevel } from '~/modules/common/blocknote/types';

/** Matches backend maxLength.field (backend/src/db/utils/constraints.ts): name column limit. */
export const TITLE_MAX_LENGTH = 255;

type LooseInlineContent = { type?: string; text?: string; content?: LooseInlineContent[] };
type LooseBlock = { type: string; props?: Record<string, unknown>; content?: unknown; children?: LooseBlock[] };

/** Plain text of a block's inline content (one nesting level for links etc.). */
const blockText = (block: LooseBlock | undefined): string => {
  if (!block || !Array.isArray(block.content)) return '';
  const collect = (items: LooseInlineContent[]): string =>
    items.map((item) => item.text ?? (Array.isArray(item.content) ? collect(item.content) : '')).join('');
  return collect(block.content as LooseInlineContent[]);
};

/** True when a block renders nothing: no text, no children, and not a media/void block. */
const isEmptyTextBlock = (block: LooseBlock): boolean =>
  Array.isArray(block.content) && blockText(block).trim() === '' && !block.children?.length;

const titleBlock = (name: string, level: TitleLevel) =>
  ({
    type: 'heading',
    props: { level },
    content: name ? [{ type: 'text', text: name, styles: {} }] : [],
  }) as unknown as CustomBlock;

/** A stringified single empty title block, the sync seed for create forms. */
export const emptyTitleDocument = (level: TitleLevel = 1) => JSON.stringify([titleBlock('', level)]);

/** A stringified title document seeded with `name`, for forms that open pre-titled. */
export const seededTitleDocument = (name: string, level: TitleLevel = 1) => JSON.stringify([titleBlock(name, level)]);

/** Synchronous title read from stringified blocks. */
export const titleFromBlocks = (strBlocks: string): string => {
  try {
    const blocks = JSON.parse(strBlocks) as LooseBlock[];
    return blockText(blocks[0]).trim();
  } catch {
    return '';
  }
};

/** Pure split of parsed blocks: block 0 text → name, the rest (sans trailing empties) → body. */
export const splitTitleBlocks = (blocks: LooseBlock[]): { name: string; body: LooseBlock[] } => {
  const [first, ...rest] = blocks;
  while (rest.length && isEmptyTextBlock(rest[rest.length - 1])) rest.pop();
  return { name: blockText(first).trim(), body: rest };
};

/**
 * Drops the trailing empty blocks the editor leaves behind before the document is stored. Block 0 is
 * kept whatever its state: an entity without a title yet still needs its title block to edit into.
 */
export const trimTitleDocument = (strBlocks: string): string => {
  const blocks = JSON.parse(strBlocks) as LooseBlock[];
  const [first, ...rest] = blocks;
  while (rest.length && isEmptyTextBlock(rest[rest.length - 1])) rest.pop();
  return JSON.stringify([first, ...rest]);
};

/** True when the document carries more than its title, so a create form can tell an empty body apart. */
export const titleDocumentHasBody = (strBlocks: string): boolean => {
  try {
    return splitTitleBlocks(JSON.parse(strBlocks) as LooseBlock[]).body.length > 0;
  } catch {
    return false;
  }
};
