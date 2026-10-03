import type { Block } from '@blocknote/core';
import { isRecord } from './as-record.ts';
import { isUuid } from './entity-id.ts';
import { getInlineTextFromBlock, getSearchableTextFromBlocks, mediaBlockTypes } from './text-from-block.ts';

/** Tolerant of custom block types. */
export type DescriptionBlock = { type: string; props?: Record<string, unknown>; content?: unknown[]; children?: DescriptionBlock[] };

export type DescriptionCounts = {
  expandable: boolean;
  checkboxCount: number;
  checkedCount: number;
  attachmentCount: number;
  /** Attachment entity ids referenced by media blocks (unique, document order). */
  attachments: string[];
};

export const emptyDescriptionCounts = (): DescriptionCounts => ({
  expandable: false,
  checkboxCount: 0,
  checkedCount: 0,
  attachmentCount: 0,
  attachments: [],
});

/**
 * One depth-first walk gathering every count-based derived property, shared by backend and
 * frontend derivation so the two cannot drift. `attachmentCount` counts media blocks with any
 * reference, external URLs included; `attachments` collects attachment entity ids only.
 */
export const countDescriptionBlocks = (blocks: DescriptionBlock[]): DescriptionCounts => {
  const counts = emptyDescriptionCounts();
  counts.expandable = blocks.length > 1;
  const seen = new Set<string>();

  const walk = (items: DescriptionBlock[]) => {
    for (const block of items) {
      if (block.type === 'checklistItem') {
        counts.checkboxCount++;
        if (block.props?.checked) counts.checkedCount++;
      }
      if (mediaBlockTypes.has(block.type) && block.props) {
        const url = block.props.url;
        if (typeof url === 'string' && url.trim().length > 0) counts.attachmentCount++;
        const attachmentId = block.props.attachmentId;
        if (typeof attachmentId === 'string' && attachmentId.length > 0 && !seen.has(attachmentId)) {
          seen.add(attachmentId);
          counts.attachments.push(attachmentId);
        }
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return counts;
};

type SummarySource = { source: DescriptionBlock | undefined; summaryLength: number };

/** The first non-checklist block with text, else the first block, with its plain-text length. */
export const findSummarySource = (blocks: DescriptionBlock[]): SummarySource => {
  const source =
    blocks.find(
      ({ type, content }) =>
        type !== 'checklistItem' &&
        Array.isArray(content) &&
        content.some((item) => {
          const text = (item as { text?: unknown }).text;
          return typeof text === 'string' && text.trim().length > 0;
        }),
    ) || blocks[0];

  const summaryLength = Array.isArray(source?.content)
    ? (source.content as { text?: string }[]).reduce((len, item) => len + (item.text?.length ?? 0), 0)
    : 0;

  return { source, summaryLength };
};

/** Fallback for summary sources the per-side HTML converters cannot render. */
export const blockPlainText = (block: DescriptionBlock): string =>
  Array.isArray(block.content) ? (block.content as { text?: string }[]).map((item) => item.text ?? '').join('') : '';

/** Everything the app derives from one stored description. */
export type DerivedDocument = {
  /** Block 0's inline text (`titleFromDocument`): the title of a title document, empty when block 0 has none (an image). */
  name: string;
  /**
   * Search text of every block, link and media URL terms included, whitespace-collapsed, at most 900 characters: enough for a list
   * filter. An app whose search needs every word derives its own column in its update operation and leaves this one out of its
   * client derivation.
   */
  keywords: string;
  /** The `findSummarySource` block as a one-block document (`JSON.stringify([block])`), rendered at view time; empty without one. */
  summary: string;
  /** Plain-text length of the summary block, 0 without one. */
  summaryLength: number;
  /** Attachment entity ids referenced by media blocks (unique, document order), as in `counts`. */
  attachments: string[];
  /** Mentioned user ids (unique, document order): mention nodes at any depth, then HTML mention spans. */
  mentions: string[];
  counts: DescriptionCounts;
  /** The parsed document; empty when the body is not a block document. */
  blocks: DescriptionBlock[];
};

/** The span the editor renders around a mention: how an HTML body carries one. */
const htmlMentionPattern = /data-mention-id=["']([0-9a-f-]{36})["']/gi;

const keywordsBudget = 900;

const emptySummary = () => ({ summary: '', summaryLength: 0 });

/** Walks any parsed JSON, collecting `{ type: 'mention', props: { id } }` nodes at any depth. */
const collectMentionNodes = (node: unknown, into: Set<string>): void => {
  if (Array.isArray(node)) {
    for (const child of node) collectMentionNodes(child, into);
    return;
  }
  if (!isRecord(node)) return;

  if (node.type === 'mention' && isRecord(node.props)) {
    const id = node.props.id;
    // Ids are UUIDs; anything else is a malformed or hand-written payload and is dropped.
    if (typeof id === 'string' && isUuid(id)) into.add(id);
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value) || isRecord(value)) collectMentionNodes(value, into);
  }
};

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/** A derivation that trips over a malformed block yields its empty value. */
const attempt = <T>(derive: () => T, empty: () => T): T => {
  try {
    return derive();
  } catch {
    return empty();
  }
};

/**
 * One parse of a stored description (BlockNote JSON, or HTML in older bodies), deriving what the
 * write paths store, the client's collaborative patches carry, and the notification fan-out
 * reads. Mention ids come from the body itself, so a caller decides who may be told about them.
 * Never throws: a malformed body must not fail the write it is derived from.
 */
export const deriveDocument = (description: string | null | undefined): DerivedDocument => {
  const parsed = description ? parseJson(description) : undefined;
  const blocks = Array.isArray(parsed) ? (parsed as DescriptionBlock[]) : [];

  // The title rule of `titleFromDocument`: block 0's inline text, empty for a block without any (an image).
  const name = attempt(
    () => getInlineTextFromBlock(blocks[0]),
    () => '',
  );
  const keywords = attempt(
    () =>
      getSearchableTextFromBlocks(blocks as Block[])
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, keywordsBudget),
    () => '',
  );
  const { summary, summaryLength } = attempt(() => {
    const found = findSummarySource(blocks);
    return isRecord(found.source) ? { summary: JSON.stringify([found.source]), summaryLength: found.summaryLength } : emptySummary();
  }, emptySummary);
  const counts = attempt(() => countDescriptionBlocks(blocks), emptyDescriptionCounts);

  const mentions = new Set<string>();
  collectMentionNodes(parsed, mentions);
  if (description) {
    for (const match of description.matchAll(htmlMentionPattern)) {
      const id = match[1];
      if (id && isUuid(id)) mentions.add(id.toLowerCase());
    }
  }

  return { name, keywords, summary, summaryLength, attachments: counts.attachments, mentions: [...mentions], counts, blocks };
};
