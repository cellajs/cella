import { describe, expect, it } from 'vitest';
import { formatSearchParts, parseSearchParts, parseSearchQuery } from './parse-search-query';

describe('parseSearchQuery', () => {
  it('reads words, quoted phrases and exclusions, folded', () => {
    const { terms, excludeTerms, highlight } = parseSearchQuery('Renée "Sync  engine" -Later -"Needs design" front-end');
    expect(terms).toEqual(['renee', 'sync engine', 'front-end']);
    expect(excludeTerms).toEqual(['later', 'needs design']);
    expect(highlight).toBe(false);
  });

  it('highlights only when a term to match follows the marker', () => {
    expect(parseSearchQuery('=api -later').highlight).toBe(true);
    expect(parseSearchQuery('=-later').highlight).toBe(false);
    expect(parseSearchQuery('=').highlight).toBe(false);
  });

  it('treats a lone minus or an empty quote as still being typed', () => {
    expect(parseSearchParts('api - "')).toEqual([{ text: 'api', exclude: false }]);
    expect(parseSearchParts('-"needs des')).toEqual([{ text: 'needs des', exclude: true }]);
  });
});

describe('formatSearchParts', () => {
  it('quotes phrases and marks exclusions', () => {
    expect(
      formatSearchParts([
        { text: 'Sync engine', exclude: false },
        { text: 'Later', exclude: true },
      ]),
    ).toBe('"Sync engine" -Later');
  });
});
