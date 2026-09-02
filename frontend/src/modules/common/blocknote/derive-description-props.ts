import {
  countDescriptionBlocks,
  type DescriptionBlock,
  type DescriptionCounts,
  emptyDescriptionCounts,
  findSummarySource,
} from 'shared/utils/derive-description-core';
import { blocksToHTML } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';

/** Count-based derived properties, including the referenced attachment ids; the walk is shared with the backend. */
export type DerivedDescriptionCounts = DescriptionCounts;

export type DerivedDescriptionProps = DerivedDescriptionCounts & {
  summary: string;
  summaryLength: number;
};

/** Synchronous, so it is safe for optimistic updates in onMutate. */
export const deriveDescriptionCounts = (description: string): DerivedDescriptionCounts => {
  try {
    return countDescriptionBlocks(JSON.parse(description) as DescriptionBlock[]);
  } catch {
    return emptyDescriptionCounts();
  }
};

/** Async because the summary needs HTML conversion. */
export const deriveDescriptionProps = async (description: string): Promise<DerivedDescriptionProps> => {
  const blocks = JSON.parse(description) as CustomBlock[];
  const counts = countDescriptionBlocks(blocks as DescriptionBlock[]);

  const { source, summaryLength } = findSummarySource(blocks as DescriptionBlock[]);

  const html = source ? await blocksToHTML(JSON.stringify([source])) : '';
  const summary = html.replace(/^<p[^>]*>(.*)<\/p>$/s, '$1');

  return { summary, summaryLength, ...counts };
};
