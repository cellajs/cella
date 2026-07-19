import { describe, expect, it } from 'vitest';
import { selectRecentActivity } from '../helpers/activity-feed';

describe('selectRecentActivity (template feed pattern)', () => {
  it('interleaves rows newest-first by publish time, falling back to create time', () => {
    const items = [
      { id: 'old', createdAt: '2026-07-01T00:00:00Z' },
      { id: 'published-late', createdAt: '2026-07-02T00:00:00Z', publishedAt: '2026-07-18T00:00:00Z' },
      { id: 'recent', createdAt: '2026-07-10T00:00:00Z', publishedAt: null },
    ];

    const feed = selectRecentActivity(items, 10);

    // Publishing an old draft counts as new activity; same recency key as unseen tracking.
    expect(feed.map((i) => i.id)).toEqual(['published-late', 'recent', 'old']);
  });

  it('caps the feed at the requested size without mutating the source', () => {
    const items = [
      { id: 'a', createdAt: '2026-07-01T00:00:00Z' },
      { id: 'b', createdAt: '2026-07-02T00:00:00Z' },
      { id: 'c', createdAt: '2026-07-03T00:00:00Z' },
    ];

    const feed = selectRecentActivity(items, 2);

    expect(feed.map((i) => i.id)).toEqual(['c', 'b']);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts rows with unparsable timestamps last instead of throwing', () => {
    const items = [
      { id: 'ok', createdAt: '2026-07-02T00:00:00Z' },
      { id: 'broken', createdAt: null },
    ];

    expect(selectRecentActivity(items, 10).map((i) => i.id)).toEqual(['ok', 'broken']);
  });
});
