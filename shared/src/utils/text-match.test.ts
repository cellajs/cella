import { describe, expect, it } from 'vitest';
import { containsWord, findMatchRanges, foldText, matchesTerms, parseTerms, trimAroundMatch } from './text-match';

describe('foldText', () => {
  it('lowercases and strips accents', () => {
    expect(foldText('Renée Coördinatie')).toBe('renee coordinatie');
  });

  it('leaves letters without a combining mark alone', () => {
    expect(foldText('Straße Ærø')).toBe('straße ærø');
  });

  it('is idempotent', () => {
    const once = foldText('Café');
    expect(foldText(once)).toBe(once);
  });
});

describe('parseTerms', () => {
  it('splits on whitespace and folds', () => {
    expect(parseTerms('  Café   ONE two ')).toEqual(['cafe', 'one', 'two']);
  });

  it('is empty for blank or missing input', () => {
    expect(parseTerms('   ')).toEqual([]);
    expect(parseTerms(null)).toEqual([]);
    expect(parseTerms(undefined)).toEqual([]);
  });
});

describe('matchesTerms', () => {
  const fields = ['sync drops updates', 'realtime', 'joost kramer'].map(foldText);

  it('needs every term in all mode and any term in any mode', () => {
    expect(matchesTerms(fields, ['sync', 'joost'])).toBe(true);
    expect(matchesTerms(fields, ['sync', 'missing'])).toBe(false);
    expect(matchesTerms(fields, ['sync', 'missing'], 'any')).toBe(true);
    expect(matchesTerms(fields, ['missing'], 'any')).toBe(false);
  });

  it('matches nothing without terms', () => {
    expect(matchesTerms(fields, [])).toBe(false);
    expect(matchesTerms(fields, [], 'any')).toBe(false);
  });
});

describe('findMatchRanges', () => {
  const slice = (text: string, terms: string[]) => findMatchRanges(text, terms).map(([start, end]) => text.slice(start, end));

  it('finds every occurrence, case-insensitively', () => {
    expect(slice('Sync now, SYNC later', ['sync'])).toEqual(['Sync', 'SYNC']);
  });

  it('matches across accents in both directions', () => {
    expect(slice('Café mode', ['cafe'])).toEqual(['Café']);
    expect(slice('cafe mode', parseTerms('café'))).toEqual(['cafe']);
  });

  it('keeps offsets right after characters that fold to a different length', () => {
    expect(slice('İstanbul ferry', ['ferry'])).toEqual(['ferry']);
    expect(slice('🚀 launch', ['launch'])).toEqual(['launch']);
    expect(slice('café au lait', ['lait'])).toEqual(['lait']);
  });

  it('merges overlapping terms into one range', () => {
    expect(slice('summary preview', ['summary', 'ary pre'])).toEqual(['summary pre']);
    expect(slice('aaa', ['aa'])).toEqual(['aaa']);
  });

  it('returns ranges in reading order', () => {
    expect(findMatchRanges('b a b', ['a', 'b'])).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('is empty without text or terms', () => {
    expect(findMatchRanges('', ['a'])).toEqual([]);
    expect(findMatchRanges('text', [])).toEqual([]);
    expect(findMatchRanges('text', [''])).toEqual([]);
  });
});

describe('trimAroundMatch', () => {
  const text = `${'a'.repeat(100)} needle ${'b'.repeat(100)}`;

  it('returns short text unchanged', () => {
    expect(trimAroundMatch('short needle', ['needle'])).toBe('short needle');
  });

  it('cuts a window around the first match with ellipses on cut sides', () => {
    const result = trimAroundMatch(text, ['needle'], 60);
    expect(result).toContain('needle');
    expect(result.startsWith('…')).toBe(true);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(62);
  });

  it('cuts from the start when nothing matches', () => {
    expect(trimAroundMatch(text, ['missing'], 10)).toBe(`${'a'.repeat(10)}…`);
  });

  it('finds the match through accents', () => {
    expect(trimAroundMatch(`${'x'.repeat(200)} Renée`, ['renee'], 40)).toMatch(/…x+ Renée$/);
  });
});

describe('containsWord', () => {
  it('matches whole words and phrases only', () => {
    expect(containsWord('a rapid api fix', 'api')).toBe(true);
    expect(containsWord('a rapid fix', 'api')).toBe(false);
    expect(containsWord('needs design soon', 'needs design')).toBe(true);
    expect(containsWord('front-end work', 'front')).toBe(true);
    expect(containsWord('renee', '')).toBe(false);
  });
});
