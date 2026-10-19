import { describe, expect, it } from 'vitest';
import { extractKeywords } from './extract-keywords';

describe('extractKeywords', () => {
  it('lowercases and deduplicates words', () => {
    expect(extractKeywords('Retro retro Planning')).toBe('retro planning');
  });

  it('keeps hyphen and apostrophe forms next to the stripped word', () => {
    expect(extractKeywords("Check-in with O'Neil")).toBe("checkin check-in with oneil o'neil");
  });

  it('keeps letters with accents', () => {
    expect(extractKeywords('Patiënt dossier: Renée, één café')).toBe('patiënt dossier renée één café');
  });

  it('joins several inputs and skips empty ones', () => {
    expect(extractKeywords('one', null, undefined, 'two')).toBe('one two');
  });
});
