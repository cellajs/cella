import type { Block } from '@blocknote/core';

export const mediaBlockTypes = new Set(['audio', 'video', 'image', 'file']);

type InlineContentLike = {
  type?: string;
  text?: unknown;
  href?: unknown;
  content?: unknown;
  props?: unknown;
};

const COMMON_HOST_SUFFIXES = new Set(['com', 'org', 'net', 'io', 'app', 'dev', 'co', 'ai', 'nl']);

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
  const hostParts = hostname.split('.').filter((part) => part && !COMMON_HOST_SUFFIXES.has(part));
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
const inlineText = (item: unknown): string => {
  const inline = item as InlineContentLike;

  if (typeof inline.text === 'string') return inline.text;
  if (inline.type === 'mention') {
    const props = inline.props as { name?: unknown } | undefined;
    return typeof props?.name === 'string' ? `@${props.name}` : '';
  }
  if (Array.isArray(inline.content)) return inlineContentText(inline.content);
  return '';
};

const inlineContentText = (content: unknown[]): string => collapseWhitespace(content.map(inlineText).join(' '));

/** Text of inline content, or of every cell when the block holds a table. */
const contentText = (content: Block['content']): string => {
  if (Array.isArray(content)) return inlineContentText(content);
  if (content?.type === 'tableContent' && Array.isArray(content.rows)) {
    return collapseWhitespace(
      content.rows
        .flatMap((row) =>
          row.cells.map((cell) =>
            'content' in cell && Array.isArray(cell.content) ? inlineContentText(cell.content) : '',
          ),
        )
        .join(' '),
    );
  }
  return '';
};

/** Covers inline content, table content, file-based blocks and children. */
export const getTextFromBlock = (block: Block): string => {
  const { content, children } = block;

  // Media blocks carry no inline content; their file name stands in.
  const mediaName =
    mediaBlockTypes.has(block.type) && 'name' in block.props && typeof block.props.name === 'string'
      ? block.props.name
      : '';
  let text = contentText(content) || mediaName;

  if (Array.isArray(children)) {
    const childrenText = children.map(getTextFromBlock).filter(Boolean).join(' ');
    if (childrenText) text += (text ? ' ' : '') + childrenText;
  }

  return text.trim();
};

/** `inlineText` plus link URL metadata, so the domain and slug of a link are searchable too. */
const getSearchableTextFromInlineContent = (content: unknown[]): string => {
  return collapseWhitespace(
    content
      .map((item) => {
        const inline = item as InlineContentLike;
        const href = typeof inline.href === 'string' ? getSearchableTextFromUrl(inline.href) : '';
        return [inlineText(item), href].filter(Boolean).join(' ');
      })
      .join(' '),
  );
};

/** For search indexing: adds URL metadata from link and media URLs to `getTextFromBlock`. */
export const getSearchableTextFromBlock = (block: Block): string => {
  const { content, children } = block;
  const parts: string[] = [];

  if (Array.isArray(content)) {
    parts.push(getSearchableTextFromInlineContent(content));
  } else if (content?.type === 'tableContent' && Array.isArray(content.rows)) {
    parts.push(
      content.rows
        .flatMap((row) =>
          row.cells.flatMap((cell) =>
            'content' in cell && Array.isArray(cell.content) ? getSearchableTextFromInlineContent(cell.content) : '',
          ),
        )
        .filter(Boolean)
        .join(' '),
    );
  }

  if (mediaBlockTypes.has(block.type)) {
    if ('name' in block.props && typeof block.props.name === 'string') parts.push(block.props.name);
    if ('url' in block.props && typeof block.props.url === 'string') {
      parts.push(getSearchableTextFromUrl(block.props.url));
    }
  }

  if (Array.isArray(children)) parts.push(...children.map(getSearchableTextFromBlock));

  return parts
    .filter((text) => text.trim().length > 0)
    .join(' ')
    .trim();
};

export const getSearchableTextFromBlocks = (blocks: Block[]): string =>
  blocks.map(getSearchableTextFromBlock).filter(Boolean).join(' ').trim();

/** Blocks of a stored document (`description` as composer output); null for absent, legacy HTML or malformed input. */
export const parseBlocks = (description: string | null | undefined): Block[] | null => {
  if (!description) return null;
  try {
    const parsed: unknown = JSON.parse(description);
    return Array.isArray(parsed) ? (parsed as Block[]) : null;
  } catch {
    return null;
  }
};

/** Plain text of a stored block document, for captions and excerpts; null when the input is not a block document. */
export const textFromDocument = (description: string | null | undefined): string | null => {
  const blocks = parseBlocks(description);
  return blocks ? blocks.map(getTextFromBlock).filter(Boolean).join(' ') : null;
};
