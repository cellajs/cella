import type { Block } from '@blocknote/core';
import { getTextFromBlock } from 'shared/blocknote';

/** Lowercased, deduplicated words; internal hyphens and apostrophes are kept alongside the stripped form. */
export const extractKeywords = (...inputs: (string | null | undefined)[]): string => {
  const combined = inputs.filter(Boolean).join(' ');

  const regex = /[a-z0-9]+(?:[-'][a-z0-9]+)?/gi;

  const words = new Set<string>();
  const matches = combined.match(regex) || [];

  for (const match of matches) {
    const lowerWord = match.toLowerCase();
    const cleanedWord = lowerWord.replace(/[^a-z0-9]/g, '');
    words.add(cleanedWord);
    if (cleanedWord !== lowerWord) words.add(lowerWord);
  }

  return Array.from(words).join(' ');
};

export const extractKeywordsFromBlocks = (blocksJson: string, ...extras: (string | null | undefined)[]): string => {
  const blocks = JSON.parse(blocksJson) as Block[];
  const fullText = blocks.map(getTextFromBlock).join(' ').trim();
  return extractKeywords(fullText, ...extras);
};
