import { describe, expect, it } from 'vitest';
import { isDefaultListView } from './create-query-keys';

const defaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

describe('isDefaultListView', () => {
  it('is true when every filter is absent, empty, or equal to its default', () => {
    expect(isDefaultListView({}, defaults)).toBe(true);
    expect(isDefaultListView({ q: undefined, sort: undefined, order: undefined }, defaults)).toBe(true);
    expect(isDefaultListView({ q: '', sort: 'createdAt', order: 'desc' }, defaults)).toBe(true);
  });

  it('is false when any filter deviates from its default', () => {
    expect(isDefaultListView({ q: 'invoice', sort: 'createdAt', order: 'desc' }, defaults)).toBe(false);
    expect(isDefaultListView({ q: '', sort: 'name', order: 'desc' }, defaults)).toBe(false);
    expect(isDefaultListView({ q: '', sort: 'createdAt', order: 'asc' }, defaults)).toBe(false);
  });

  it('treats an empty search string as default even when the default is undefined', () => {
    expect(isDefaultListView({ q: '' }, {})).toBe(true);
  });
});
