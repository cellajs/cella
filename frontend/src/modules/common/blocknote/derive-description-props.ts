import { type DescriptionCounts, deriveDocument, findSummarySource } from 'shared/utils/derive-description-core';
import { blocksToHTML } from '~/modules/common/blocknote/helpers/blocknote-helpers';

/** Count-based derived properties, including the referenced attachment ids; the walk is shared with the backend. */
export type DerivedDescriptionCounts = DescriptionCounts;

export type DerivedDescriptionProps = DerivedDescriptionCounts & { summary: string; summaryLength: number };

/** Synchronous, so it is safe for optimistic updates in onMutate. */
export const deriveDescriptionCounts = (description: string): DerivedDescriptionCounts => deriveDocument(description).counts;

/** Async because the summary needs HTML conversion. */
export const deriveDescriptionProps = async (description: string): Promise<DerivedDescriptionProps> => {
  const { blocks, counts } = deriveDocument(description);

  const { source, summaryLength } = findSummarySource(blocks);

  const html = source ? await blocksToHTML(JSON.stringify([source])) : '';
  const summary = html.replace(/^<p[^>]*>(.*)<\/p>$/s, '$1');

  return { summary, summaryLength, ...counts };
};
