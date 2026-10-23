import { describe, expect, it } from 'vitest';
import { resolveSearchInput, withoutRecentSearch } from '~/utils/recent-searches';

describe('withoutRecentSearch', () => {
  it('drops the entry, and hands back the same array when it holds none, so the store skips the write', () => {
    const list = ['passkeys', 'rate limits'];
    expect(withoutRecentSearch(list, 'passkeys')).toEqual(['rate limits']);
    expect(withoutRecentSearch(list, 'missing')).toBe(list);
  });
});

describe('resolveSearchInput', () => {
  const history = ['logical replication', 'passkeys', 'rate limits'];

  it('picks a history entry only for a bare index typed into an empty input', () => {
    expect(resolveSearchInput('', '1', history)).toBe('passkeys');
    // A digit left over from backspacing, typed after other text, leading a query, or past the history stays as typed.
    expect(resolveSearchInput('12', '1', history)).toBe('1');
    expect(resolveSearchInput('abc', 'abc1', history)).toBe('abc1');
    expect(resolveSearchInput('', '2fa', history)).toBe('2fa');
    expect(resolveSearchInput('', '7', history)).toBe('7');
  });
});
