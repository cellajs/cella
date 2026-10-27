import type { Block } from '@blocknote/core';
import { getTextFromBlock } from 'shared/blocknote';

/** Lowercased, deduplicated words; internal hyphens and apostrophes are kept alongside the stripped form. */
export const extractKeywords = (...inputs: (string | null | undefined)[]): string => {
  const combined = inputs.filter(Boolean).join(' ');

  const regex = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu;

  const words = new Set<string>();
  const matches = combined.match(regex) || [];

  for (const match of matches) {
    const lowerWord = match.toLowerCase();
    const cleanedWord = lowerWord.replace(/[^\p{L}\p{N}]/gu, '');
    words.add(cleanedWord);
    if (cleanedWord !== lowerWord) words.add(lowerWord);
  }

  return Array.from(words).join(' ');
};

/** The keywords of a stored BlockNote document (blocks as a JSON string) and of `extras`. */
export const extractKeywordsFromBlocks = (blocksJson: string, ...extras: (string | null | undefined)[]): string => {
  const blocks = JSON.parse(blocksJson) as Block[];
  const fullText = blocks.map(getTextFromBlock).join(' ').trim();
  return extractKeywords(fullText, ...extras);
};
