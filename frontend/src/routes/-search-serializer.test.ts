import { describe, expect, it } from 'vitest';
import { parseSearch, stringifySearch } from '~/routes/-search-serializer';

// Pins the wire form app routes and bookmarks depend on; `?q=123` once parsed as a number and crashed the page.
describe('search serializer', () => {
  it('reads every value as a string', () => {
    expect(parseSearch('?q=123&force=true&status=a%2Cb')).toEqual({ q: '123', force: 'true', status: 'a,b' });
  });

  it('writes a list comma-separated and leaves out empty values', () => {
    const search = { q: '123', status: ['a', 'b'], none: [], gone: undefined, force: true, view: '' };
    expect(stringifySearch(search)).toBe('?q=123&status=a,b&force=true');
  });

  it('round-trips a value with reserved characters', () => {
    const search = { q: 'a&b=c+d #1 ü', redirect: '/x/y?z=1' };
    expect(parseSearch(stringifySearch(search))).toEqual(search);
  });
});
