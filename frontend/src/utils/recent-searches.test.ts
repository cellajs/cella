import { describe, expect, it } from 'vitest';
import { addRecentSearch } from './recent-searches';

describe('addRecentSearch', () => {
  it('puts the most recent search on top', () => {
    let list: string[] = [];
    list = addRecentSearch(list, 'first query');
    list = addRecentSearch(list, 'second query');
    expect(list).toEqual(['second query', 'first query']);
  });

  it('skips values shorter than 3 normalized characters', () => {
    const list = ['existing query'];
    expect(addRecentSearch(list, 'a b')).toBe(list);
    expect(addRecentSearch(list, ' - ')).toBe(list);
  });

  it('dedupes case, whitespace and special-character variants, keeping the fresh input', () => {
    let list = addRecentSearch([], 'Logical Replication');
    list = addRecentSearch(list, 'logical-replication');
    expect(list).toEqual(['logical-replication']);
  });

  it('keeps the most detailed entry when searching a less detailed variant, bumped to top', () => {
    let list = addRecentSearch([], 'user roles');
    list = addRecentSearch(list, 'other topic');
    list = addRecentSearch(list, 'user');
    expect(list).toEqual(['user roles', 'other topic']);
  });

  it('replaces a less detailed entry when searching a more detailed variant', () => {
    let list = addRecentSearch([], 'user');
    list = addRecentSearch(list, 'user roles');
    expect(list).toEqual(['user roles']);
  });

  it('collapses multiple contained variants into the most detailed one', () => {
    let list = addRecentSearch([], 'user roles');
    list = addRecentSearch(list, 'user roles admin');
    list = addRecentSearch(list, 'user');
    expect(list).toEqual(['user roles admin']);
  });

  it('caps the list at 5, dropping the oldest', () => {
    let list: string[] = [];
    for (const term of ['one111', 'two222', 'three333', 'four444', 'five555', 'six666']) {
      list = addRecentSearch(list, term);
    }
    expect(list).toEqual(['six666', 'five555', 'four444', 'three333', 'two222']);
  });
});
