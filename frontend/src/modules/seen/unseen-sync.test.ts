import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });

const { queryClient } = await import('~/query/query-client');
const { seenKeys } = await import('./helpers');
const { useSeenStore } = await import('./seen-store');
const { applyUnfetchableRemovalUnseen, ingestSyncedRows, noteUnseenReconciled } = await import('./unseen-sync');

// Base config tracks 'attachment'; rows are attachment-shaped (org-homed → channelId = orgId).
const CHANNEL = 'org-1';
const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organizationId: CHANNEL,
  createdAt: now(),
  deletedAt: null,
  ...overrides,
});

const counts = () => (queryClient.getQueryData(seenKeys.unseenCounts) as Record<string, Record<string, number>>) ?? {};

/** Flush deltas batched by the idle callback (setTimeout fallback outside the browser). */
const settle = () => vi.advanceTimersByTimeAsync(5_100);

describe('unseen count deltas from synced rows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryClient.setQueryData(seenKeys.unseenCounts, { [CHANNEL]: { attachment: 5 } });
    useSeenStore.getState().reset();
    noteUnseenReconciled();
  });

  afterEach(() => {
    queryClient.removeQueries({ queryKey: seenKeys.unseenCounts });
    vi.useRealTimers();
  });

  it('counts a new unseen row once, even when it reappears in later ranges (created, then updated)', async () => {
    vi.advanceTimersByTime(10); // created after the reconcile anchor
    ingestSyncedRows('attachment', CHANNEL, [row('a1')]);
    ingestSyncedRows('attachment', CHANNEL, [row('a1')]); // same row, next range
    await settle();

    expect(counts()[CHANNEL].attachment).toBe(6);
  });

  it('does not count rows already covered by the exact baseline (created before the reconcile anchor)', async () => {
    ingestSyncedRows('attachment', CHANNEL, [row('old-1', { createdAt: daysAgo(1) })]);
    await settle();

    expect(counts()[CHANNEL].attachment).toBe(5);
  });

  it('does not count rows outside the seen window or rows this client already saw', async () => {
    vi.advanceTimersByTime(10);
    useSeenStore.getState().markProductSeen('tenant-1', CHANNEL, CHANNEL, 'attachment', 'seen-1');
    await settle(); // markProductSeen itself queued a -1 (5 → 4)

    ingestSyncedRows('attachment', CHANNEL, [
      row('ancient', { createdAt: daysAgo(120) }), // outside 90-day window
      row('seen-1'), // locally seen
    ]);
    await settle();

    expect(counts()[CHANNEL].attachment).toBe(4);
  });

  it('decrements for a tombstoned baseline row, and nets zero for a row it counted itself', async () => {
    // Baseline row soft-deleted → −1 (5 → 4)
    ingestSyncedRows('attachment', CHANNEL, [row('base-1', { createdAt: daysAgo(1), deletedAt: now() })]);
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(4);

    // Live row: +1 then tombstone −1 → net zero
    vi.advanceTimersByTime(10);
    ingestSyncedRows('attachment', CHANNEL, [row('live-1')]);
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(5);
    ingestSyncedRows('attachment', CHANNEL, [row('live-1', { deletedAt: now() })]);
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(4);
  });

  it('reconcile wins wholesale: after noteUnseenReconciled, re-ingested rows are baseline rows', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows('attachment', CHANNEL, [row('a2')]);
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(6);

    noteUnseenReconciled(); // exact recount replaced the cache; anchor moves forward
    ingestSyncedRows('attachment', CHANNEL, [row('a2')]); // same row again → baseline's job now
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(6);
  });

  it('unfetchable removal decrements unseen rows and nets zero for locally-seen ones', async () => {
    applyUnfetchableRemovalUnseen('attachment', 'gone-1', CHANNEL); // unseen → −1
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(4);

    useSeenStore.getState().markProductSeen('tenant-1', CHANNEL, CHANNEL, 'attachment', 'gone-2');
    await settle(); // view-mark −1 (4 → 3)
    applyUnfetchableRemovalUnseen('attachment', 'gone-2', CHANNEL); // seen → net 0
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(3);
  });

  it('derives the channel from the row (deepest ancestor id), falling back to the passed channel', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows('attachment', 'fallback-ch', [
      row('c1'), // row's own organizationId wins over the fallback
      { id: 'c2', createdAt: now(), deletedAt: null }, // no ancestor id on the row → fallback
    ]);
    await settle();

    expect(counts()[CHANNEL].attachment).toBe(6);
    expect(counts()['fallback-ch'].attachment).toBe(1);
  });

  it('publish lights the badge: recency keys on publishedAt, not the old createdAt', async () => {
    vi.advanceTimersByTime(10);
    // The draft's createdAt is outside the window and before the reconcile anchor.
    // Its recent publishedAt value makes it count as new.
    ingestSyncedRows('attachment', CHANNEL, [row('pub-1', { createdAt: daysAgo(100), publishedAt: now() })]);
    await settle();

    expect(counts()[CHANNEL].attachment).toBe(6);
  });

  it('never counts an unpublished draft (defense in depth — drafts do not sync at all)', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows('attachment', CHANNEL, [row('draft-1', { publishedAt: null })]);
    await settle();

    expect(counts()[CHANNEL].attachment).toBe(5);
  });

  it('ignores untracked entity types', async () => {
    ingestSyncedRows('page' as never, CHANNEL, [row('p1')]);
    await settle();
    expect(counts()[CHANNEL].attachment).toBe(5);
  });
});
