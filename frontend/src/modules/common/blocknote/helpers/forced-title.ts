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

/** Compose `[heading(name), ...body-from-HTML]`; the title block projects `name` and is never persisted in `description`. */
export const composeTitleDocument = async (
  name: string,
  descriptionHtml: string | null,
  level: TitleLevel = 1,
): Promise<string> => {
  const bodyBlocks: CustomBlock[] = [];
  if (descriptionHtml) {
    const { getHeadlessEditor } = await import('~/modules/common/blocknote/helpers/blocknote-helpers');
    const parsed = await Promise.resolve(getHeadlessEditor().tryParseHTMLToBlocks(descriptionHtml));
    bodyBlocks.push(...(parsed as CustomBlock[]));
  }
  return JSON.stringify([titleBlock(name, level), ...bodyBlocks]);
};

/** Split a forced-title document back into `name` + `description` HTML (null when body is empty). */
export const splitTitleDocument = async (strBlocks: string): Promise<{ name: string; description: string | null }> => {
  const { name, body } = splitTitleBlocks(JSON.parse(strBlocks) as LooseBlock[]);
  if (body.length === 0) return { name, description: null };
  const { blocksToHTML } = await import('~/modules/common/blocknote/helpers/blocknote-helpers');
  const html = await blocksToHTML(JSON.stringify(body));
  return { name, description: html || null };
};
