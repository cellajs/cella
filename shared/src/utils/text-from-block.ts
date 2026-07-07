import type { Block } from '@blocknote/core';

export const mediaBlockTypes = new Set(['audio', 'video', 'image', 'file']);

type InlineContentLike = {
  type?: string;
  text?: unknown;
  href?: unknown;
  content?: unknown;
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
 * Extracts safe search terms from a URL without indexing query strings or fragments.
 * This keeps links discoverable by domain/path/slug while avoiding tokens and tracking params.
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

/**
 * Recursively extracts plain text from a BlockNote block,
 * including inline content, table content, file-based blocks, and children.
 */
export const getTextFromBlock = (block: Block): string => {
  const { content, children } = block;

  let text = '';

  if (Array.isArray(content)) {
    text += content
      .map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''))
      .join(' ')
      .trim();
  } else if (content?.type === 'tableContent' && Array.isArray(content.rows)) {
    text += content.rows
      .flatMap((row) =>
        row.cells.flatMap((cell) =>
          'content' in cell && Array.isArray(cell.content)
            ? cell.content.map((item) => ('text' in item && typeof item.text === 'string' ? item.text : '')).join(' ')
            : '',
        ),
      )
      .join(' ')
      .trim();
  } else if (
    mediaBlockTypes.has(block.type) &&
    'name' in block.props &&
    typeof block.props.name === 'string'
  ) {
    text += block.props.name;
  }

  if (Array.isArray(children)) {
    const childrenText = children
      .map(getTextFromBlock)
      .filter((t) => t.trim().length > 0)
      .join(' ')
      .trim();

    if (childrenText) text += (text ? ' ' : '') + childrenText;
  }

  return text.trim();
};

const getSearchableTextFromInlineContent = (content: unknown[]): string => {
  return content
    .map((item) => {
      const inline = item as InlineContentLike;
      const parts: string[] = [];

      if (typeof inline.text === 'string') parts.push(inline.text);
      if (typeof inline.href === 'string') parts.push(getSearchableTextFromUrl(inline.href));
      if (Array.isArray(inline.content)) parts.push(getSearchableTextFromInlineContent(inline.content));

      return parts.filter(Boolean).join(' ');
    })
    .filter((text) => text.trim().length > 0)
    .join(' ')
    .trim();
};

/**
 * Recursively extracts text intended for search indexing.
 * Unlike getTextFromBlock, this includes safe URL metadata from link/media URLs.
 */
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
            'content' in cell && Array.isArray(cell.content)
              ? getSearchableTextFromInlineContent(cell.content)
              : '',
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

  return parts.filter((text) => text.trim().length > 0).join(' ').trim();
};

export const getSearchableTextFromBlocks = (blocks: Block[]): string =>
  blocks.map(getSearchableTextFromBlock).filter(Boolean).join(' ').trim();
