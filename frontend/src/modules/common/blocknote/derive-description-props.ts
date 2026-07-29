import { blocksToHTML, walkBlocks } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';

export type DerivedDescriptionCounts = {
  expandable: boolean;
  checkboxCount: number;
  checkedCount: number;
  attachmentCount: number;
};

export type DerivedDescriptionProps = DerivedDescriptionCounts & {
  summary: string;
  summaryLength: number;
};

const mediaTypes = new Set(['audio', 'video', 'image', 'file']);
const skipForSummary = new Set(['checklistItem']);

/** Single depth-first walk that gathers all count-based derived properties. */
const countBlocks = (blocks: CustomBlock[]): DerivedDescriptionCounts => {
  let checkboxCount = 0;
  let checkedCount = 0;
  let attachmentCount = 0;

  walkBlocks(blocks, (block) => {
    if (block.type === 'checklistItem') {
      checkboxCount++;
      if (block.props && 'checked' in block.props && block.props.checked) checkedCount++;
    }
    if (
      mediaTypes.has(block.type) &&
      'url' in block.props &&
      typeof block.props.url === 'string' &&
      block.props.url.trim().length > 0
    ) {
      attachmentCount++;
    }
  });

  return { expandable: blocks.length > 1, checkboxCount, checkedCount, attachmentCount };
};

/**
 * Parse description blocks once and extract all count-based derived properties.
 * Synchronous and safe for optimistic updates in onMutate.
 */
export const deriveDescriptionCounts = (description: string): DerivedDescriptionCounts => {
  try {
    return countBlocks(JSON.parse(description) as CustomBlock[]);
  } catch {
    return { expandable: false, checkboxCount: 0, checkedCount: 0, attachmentCount: 0 };
  }
};

/**
 * Derive all description properties including summary (async due to HTML conversion).
 * Uses a single parse and walk for summary and count derivation.
 */
export const deriveDescriptionProps = async (description: string): Promise<DerivedDescriptionProps> => {
  const blocks = JSON.parse(description) as CustomBlock[];
  const counts = countBlocks(blocks);

  // Find summary source: first non-checklist block with text content
  const summarySource =
    blocks.find(
      ({ type, content }) =>
        !skipForSummary.has(type) &&
        Array.isArray(content) &&
        content.some((item) => 'text' in item && !!item.text.trim()),
    ) || blocks[0];

  const summaryLength = Array.isArray(summarySource?.content)
    ? summarySource.content.reduce((len, item) => len + ('text' in item && item.text ? item.text.length : 0), 0)
    : 0;

  const html = await blocksToHTML(JSON.stringify([summarySource]));
  const summary = html.replace(/^<p[^>]*>(.*)<\/p>$/s, '$1');

  return { summary, summaryLength, ...counts };
};
