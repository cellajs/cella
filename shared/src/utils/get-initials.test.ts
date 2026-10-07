import { describe, expect, it } from 'vitest';
import { getInitials } from './get-initials';

describe('getInitials', () => {
  it('takes the first letter of the first and of the last word', () => {
    expect(getInitials('Alice Smith')).toEqual(['A', 'S']);
    expect(getInitials('Flip van Haaren')).toEqual(['F', 'H']);
    expect(getInitials('  jean-pierre   dupont ')).toEqual(['J', 'D']);
  });

  it('gives one initial for a single word', () => {
    expect(getInitials('Shareworks')).toEqual(['S']);
    expect(getInitials('flip-van-haaren')).toEqual(['F']);
    expect(getInitials('flip@example.com')).toEqual(['F']);
  });

  it('skips punctuation and words without a letter or digit', () => {
    expect(getInitials('Acme (NL)')).toEqual(['A', 'N']);
    expect(getInitials('Acme & Co.')).toEqual(['A', 'C']);
    expect(getInitials('Acme -')).toEqual(['A']);
    expect(getInitials('3M Company')).toEqual(['3', 'C']);
  });

  it('keeps accented and non-latin letters whole', () => {
    expect(getInitials('Élodie Østergård')).toEqual(['É', 'Ø']);
    expect(getInitials('王小明')).toEqual(['王']);
    expect(getInitials('𝒜lice 𝒮mith')).toEqual(['𝒜', '𝒮']);
  });

  it('gives none without a usable name', () => {
    expect(getInitials(null)).toEqual([]);
    expect(getInitials('')).toEqual([]);
    expect(getInitials(' - ')).toEqual([]);
  });
});
