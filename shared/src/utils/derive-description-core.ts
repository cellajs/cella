import { mediaBlockTypes } from './text-from-block';

/** Loose block shape for parsed description JSON, tolerant of custom block types. */
export type DescriptionBlock = {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown[];
  children?: DescriptionBlock[];
};

export type DescriptionCounts = {
  expandable: boolean;
  checkboxCount: number;
  checkedCount: number;
  attachmentCount: number;
  /** Attachment entity ids referenced by media blocks (unique, document order). */
  attachments: string[];
};

/** Zeroed counts for empty or unparsable descriptions. */
export const emptyDescriptionCounts = (): DescriptionCounts => ({
  expandable: false,
  checkboxCount: 0,
  checkedCount: 0,
  attachmentCount: 0,
  attachments: [],
});

/**
 * Single depth-first walk over parsed description blocks gathering every count-based
 * derived property. Shared by backend and frontend derivation so the two sides cannot
 * drift. `attachmentCount` counts media blocks with any reference (including external
 * URLs with no attachment row); `attachments` collects only attachment entity ids.
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

/**
 * Pick the block that seeds the summary: the first non-checklist block with text
 * content, falling back to the first block. Returns it with its plain-text length.
 */
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

/** Plain-text fallback for summary sources the per-side HTML converters cannot render (custom blocks). */
export const blockPlainText = (block: DescriptionBlock): string =>
  Array.isArray(block.content)
    ? (block.content as { text?: string }[]).map((item) => item.text ?? '').join('')
    : '';
