import type { Block } from '@blocknote/core';
import { getTextFromBlock } from '#/utils/text-from-block';

/**
 * Extracts unique keywords from one or more text inputs.
 * Useful for building searchable keyword fields from entity content (name, description, etc.).
 *
 * - Lowercases all words
 * - Preserves internal punctuation (hyphens, apostrophes)
 * - Deduplicates words
 */
export const extractKeywords = (...inputs: (string | null | undefined)[]): string => {
  const combined = inputs.filter(Boolean).join(' ');

  // Regex to capture words and include internal punctuation (e.g., apostrophes and hyphens)
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

/**
 * Extracts keywords from BlockNote JSON content combined with additional text inputs.
 * Parses the BlockNote blocks to extract plain text, then runs keyword extraction.
 */
export const extractKeywordsFromBlocks = (blocksJson: string, ...extras: (string | null | undefined)[]): string => {
  const blocks = JSON.parse(blocksJson) as Block[];
  const fullText = blocks.map(getTextFromBlock).join(' ').trim();
  return extractKeywords(fullText, ...extras);
};
