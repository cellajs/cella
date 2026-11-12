import { isRecord } from './as-record.ts';
import { isUuid } from './entity-id.ts';

/** Block types that hold one file: its reference in the `url` prop, its file name in `name`. */
const mediaBlockTypeNames = ['audio', 'video', 'image', 'file'] as const;

export type MediaBlockType = (typeof mediaBlockTypeNames)[number];

export const mediaBlockTypes: ReadonlySet<string> = new Set(mediaBlockTypeNames);

/**
 * The attachment a media block names: its `attachmentId` prop, else an id-shaped `url` from before that prop.
 * Undefined for a block without a row, and for an id that is no UUID.
 */
export const attachmentIdOf = (props: { attachmentId?: unknown; url?: unknown } | undefined): string | undefined => {
  for (const ref of [props?.attachmentId, props?.url]) if (typeof ref === 'string' && isUuid(ref)) return ref;
  return undefined;
};

/** One inline item of a stored block: styled text, a link with its words in `content`, or a custom node such as a mention. */
export type DescriptionInline = { type?: string; text?: unknown; href?: unknown; content?: unknown; props?: Record<string, unknown> };

/**
 * A stored block, tolerant of custom block types. `content` is inline items, a table's rows of cells, or absent for a
 * block without content; BlockNote's `Block` and the editor's blocks both fit it.
 */
export type DescriptionBlock = {
  type: string;
  props?: Record<string, unknown>;
  content?: DescriptionInline[] | { type: 'tableContent'; rows: { cells: unknown[] }[] };
  children?: DescriptionBlock[];
};

const commonHostSuffixes = new Set(['com', 'org', 'net', 'io', 'app', 'dev', 'co', 'ai', 'nl']);

const parseUrl = (rawUrl: string): URL | null => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    if (!/^www\./i.test(trimmed)) return null;
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
};

/**
 * Search terms from a URL, excluding query strings and fragments so tokens and tracking params
 * stay unindexed while domain, path and slug remain searchable.
 */
export const getSearchableTextFromUrl = (rawUrl: string): string => {
  const url = parseUrl(rawUrl);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return '';

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const hostParts = hostname.split('.').filter((part) => part && !commonHostSuffixes.has(part));
  const decodedPath = url.pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join(' ');

  return [hostname, ...hostParts, decodedPath].filter(Boolean).join(' ');
};

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Visible text of one inline item. Styled text carries `text`, a link keeps its words in nested
 * `content`, and a mention has only props: it reads as the editor renders it, `@name`.
 */
const inlineText = (inline: DescriptionInline): string => {
  if (typeof inline.text === 'string') return inline.text;
  if (inline.type === 'mention') return typeof inline.props?.name === 'string' ? `@${inline.props.name}` : '';
  if (Array.isArray(inline.content)) return inlineContentText(inline.content);
  return '';
};

const inlineContentText = (content: DescriptionInline[]): string => collapseWhitespace(content.map(inlineText).join(' '));

/** The inline content of every cell of a table block, row by row; none for any other content or a cell in the older array form. */
const tableCellContents = (content: Exclude<DescriptionBlock['content'], unknown[]>): DescriptionInline[][] =>
  content?.type === 'tableContent' && Array.isArray(content.rows)
    ? content.rows.flatMap((row) => row.cells.map((cell) => (isRecord(cell) && Array.isArray(cell.content) ? cell.content : [])))
    : [];

/** Text of inline content, or of every cell when the block holds a table. */
const contentText = (content: DescriptionBlock['content']): string =>
  Array.isArray(content) ? inlineContentText(content) : collapseWhitespace(tableCellContents(content).map(inlineContentText).join(' '));

/** Covers inline content, table content, file-based blocks and children. */
export const getTextFromBlock = (block: DescriptionBlock): string => {
  const { content, children } = block;

  // Media blocks carry no inline content; their file name stands in.
  const name = block.props?.name;
  const mediaName = mediaBlockTypes.has(block.type) && typeof name === 'string' ? name : '';
  let text = contentText(content) || mediaName;

  if (Array.isArray(children)) {
    const childrenText = children.map(getTextFromBlock).filter(Boolean).join(' ');
    if (childrenText) text += (text ? ' ' : '') + childrenText;
  }

  return text.trim();
};

/** `inlineText` plus link URL metadata, so the domain and slug of a link are searchable too. */
const getSearchableTextFromInlineContent = (content: DescriptionInline[]): string =>
  collapseWhitespace(
    content
      .map((inline) => {
        const href = typeof inline.href === 'string' ? getSearchableTextFromUrl(inline.href) : '';
        return [inlineText(inline), href].filter(Boolean).join(' ');
      })
      .join(' '),
  );

/** For search indexing: adds URL metadata from link and media URLs to `getTextFromBlock`. */
export const getSearchableTextFromBlock = (block: DescriptionBlock): string => {
  const { content, children, props } = block;
  const parts: string[] = [];

  if (Array.isArray(content)) parts.push(getSearchableTextFromInlineContent(content));
  else parts.push(tableCellContents(content).map(getSearchableTextFromInlineContent).filter(Boolean).join(' '));

  if (mediaBlockTypes.has(block.type) && props) {
    if (typeof props.name === 'string') parts.push(props.name);
    if (typeof props.url === 'string') parts.push(getSearchableTextFromUrl(props.url));
  }

  if (Array.isArray(children)) parts.push(...children.map(getSearchableTextFromBlock));

  return parts
    .filter((text) => text.trim().length > 0)
    .join(' ')
    .trim();
};

/** {@link getSearchableTextFromBlock} of every block, joined by spaces. */
export const getSearchableTextFromBlocks = (blocks: DescriptionBlock[]): string =>
  blocks.map(getSearchableTextFromBlock).filter(Boolean).join(' ').trim();

/** Blocks of a stored document (`description` as composer output); null for an absent, HTML or malformed body. */
export const parseBlocks = (description: string | null | undefined): DescriptionBlock[] | null => {
  if (!description) return null;
  try {
    const parsed: unknown = JSON.parse(description);
    return Array.isArray(parsed) ? (parsed as DescriptionBlock[]) : null;
  } catch {
    return null;
  }
};

/** The block with fresh ids down its children: every document starts from the same `initialBlockId`, and a document holds each id once. */
export const rekeyBlock = (block: DescriptionBlock): DescriptionBlock & { id: string } => ({
  ...block,
  id: crypto.randomUUID(),
  ...(Array.isArray(block.children) && { children: block.children.map(rekeyBlock) }),
});

/** Plain text of a stored block document, for captions and excerpts; null when the input is not a block document. */
export const textFromDocument = (description: string | null | undefined): string | null => {
  const blocks = parseBlocks(description);
  return blocks ? blocks.map(getTextFromBlock).filter(Boolean).join(' ') : null;
};

/**
 * A block's own inline text as the editor shows it: runs joined without a separator, so a style change mid-word
 * adds no space. Children and media file names are left out; empty for a block without inline content.
 */
export const getInlineTextFromBlock = (block: { content?: unknown } | undefined): string =>
  block && Array.isArray(block.content) ? block.content.map(inlineText).join('').trim() : '';

/**
 * Title of a stored title document: block 0's inline text, whatever its type. Empty when block 0 holds no inline
 * content (an image moved to the top) or the input is not a block document.
 */
export const titleFromDocument = (description: string | null | undefined): string => getInlineTextFromBlock(parseBlocks(description)?.[0]);
