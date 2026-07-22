import { appConfig, hierarchy } from 'shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });

const { queryClient } = await import('~/query/query-client');
const { isSeenTracked, seenKeys } = await import('./helpers');
const { useSeenStore } = await import('./seen-store');
const { applyUnfetchableRemovalUnseen, ingestSyncedRows, noteUnseenReconciled } = await import('./unseen-sync');

// Derive tracked type and effective home from config so the fixture works across fork hierarchies.
// Rows include the chosen deepest ancestor and all required parents like real sync payloads.
const TRACKED = appConfig.seenTrackedProductTypes[0];
const ANCESTORS = hierarchy.getOrderedAncestors(TRACKED); // deepest → root
const ancestorId = Object.fromEntries(ANCESTORS.map((type) => [type, `ch-${type}`]));
const CHANNEL = ancestorId[ANCESTORS[0]]; // deepest ancestor id (the home channel)
const ORG = ancestorId[ANCESTORS[ANCESTORS.length - 1]]; // root ancestor (organization) id
// A product type that is not seen-tracked, for the negative control below.
const UNTRACKED = appConfig.productEntityTypes.find((type) => !isSeenTracked(type));

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ...Object.fromEntries(ANCESTORS.map((type) => [appConfig.entityIdColumnKeys[type], ancestorId[type]])),
  createdAt: now(),
  deletedAt: null,
  ...overrides,
});

const counts = () => (queryClient.getQueryData(seenKeys.unseenCounts) as Record<string, Record<string, number>>) ?? {};

/** Flush deltas batched by the idle callback (setTimeout fallback outside the browser). */
const settle = () => vi.advanceTimersByTimeAsync(5_100);

describe('unseen count deltas from synced rows', () => {
  // Positive control: ingestSyncedRows/applyUnfetchableRemovalUnseen early-return for any product
  // type isSeenTracked doesn't cover. If the tracked type ever stops being tracked, every "count
  // did not change" assertion below would pass vacuously. This guard fails loudly first.
  beforeAll(() => {
    expect(isSeenTracked(TRACKED)).toBe(true);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient.setQueryData(seenKeys.unseenCounts, { [CHANNEL]: { [TRACKED]: 5 } });
    useSeenStore.getState().reset();
    noteUnseenReconciled();
  });

  afterEach(() => {
    queryClient.removeQueries({ queryKey: seenKeys.unseenCounts });
    vi.useRealTimers();
  });

  it('counts a new unseen row once, even when it reappears in later ranges (created, then updated)', async () => {
    vi.advanceTimersByTime(10); // created after the reconcile anchor
    ingestSyncedRows(TRACKED, CHANNEL, [row('a1')]);
    ingestSyncedRows(TRACKED, CHANNEL, [row('a1')]); // same row, next range
    await settle();

    expect(counts()[CHANNEL][TRACKED]).toBe(6);
  });

  it('does not count rows already covered by the exact baseline (created before the reconcile anchor)', async () => {
    ingestSyncedRows(TRACKED, CHANNEL, [row('old-1', { createdAt: daysAgo(1) })]);
    await settle();

    expect(counts()[CHANNEL][TRACKED]).toBe(5);
  });

  it('does not count rows outside the seen window or rows this client already saw', async () => {
    vi.advanceTimersByTime(10);
    useSeenStore.getState().markProductSeen('tenant-1', ORG, CHANNEL, TRACKED, 'seen-1');
    await settle(); // markProductSeen itself queued a -1 (5 → 4)

    ingestSyncedRows(TRACKED, CHANNEL, [
      row('ancient', { createdAt: daysAgo(120) }), // outside 90-day window
      row('seen-1'), // locally seen
    ]);
    await settle();

    expect(counts()[CHANNEL][TRACKED]).toBe(4);
  });

  it('decrements for a tombstoned baseline row, and nets zero for a row it counted itself', async () => {
    // Baseline row soft-deleted → −1 (5 → 4)
    ingestSyncedRows(TRACKED, CHANNEL, [row('base-1', { createdAt: daysAgo(1), deletedAt: now() })]);
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(4);

    // Live row: +1 then tombstone −1 → net zero
    vi.advanceTimersByTime(10);
    ingestSyncedRows(TRACKED, CHANNEL, [row('live-1')]);
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(5);
    ingestSyncedRows(TRACKED, CHANNEL, [row('live-1', { deletedAt: now() })]);
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(4);
  });

  it('reconcile wins wholesale: after noteUnseenReconciled, re-ingested rows are baseline rows', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows(TRACKED, CHANNEL, [row('a2')]);
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(6);

    noteUnseenReconciled(); // exact recount replaced the cache; anchor moves forward
    ingestSyncedRows(TRACKED, CHANNEL, [row('a2')]); // same row again → baseline's job now
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(6);
  });

  it('unfetchable removal decrements unseen rows and nets zero for locally-seen ones', async () => {
    applyUnfetchableRemovalUnseen(TRACKED, 'gone-1', CHANNEL); // unseen → −1
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(4);

    useSeenStore.getState().markProductSeen('tenant-1', ORG, CHANNEL, TRACKED, 'gone-2');
    await settle(); // view-mark −1 (4 → 3)
    applyUnfetchableRemovalUnseen(TRACKED, 'gone-2', CHANNEL); // seen → net 0
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(3);
  });

  it('derives the channel from the row (deepest ancestor id), falling back to the passed channel', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows(TRACKED, 'fallback-ch', [
      row('c1'), // row's own home ancestor id wins over the fallback
      { id: 'c2', createdAt: now(), deletedAt: null }, // no ancestor id on the row → fallback
    ]);
    await settle();

    expect(counts()[CHANNEL][TRACKED]).toBe(6);
    expect(counts()['fallback-ch'][TRACKED]).toBe(1);
  });

  it('publish lights the badge: recency keys on publishedAt, not the old createdAt', async () => {
    vi.advanceTimersByTime(10);
    // The draft's createdAt is outside the window and before the reconcile anchor; its recent
    // publishedAt makes it count as new. The client recency rule (`publishedAt ?? createdAt`) is
    // generic, so a synced row carrying publishedAt exercises it regardless of the fork's feeds.
    ingestSyncedRows(TRACKED, CHANNEL, [row('pub-1', { createdAt: daysAgo(100), publishedAt: now() })]);
    await settle();

    expect(counts()[CHANNEL][TRACKED]).toBe(6);
  });

  it('never counts an unpublished draft (defense in depth — drafts do not sync at all)', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows(TRACKED, CHANNEL, [row('draft-1', { publishedAt: null })]);
    await settle();

    expect(counts()[CHANNEL][TRACKED]).toBe(5);
  });

  it('ignores untracked product types', async () => {
    if (!UNTRACKED) return;
    ingestSyncedRows(UNTRACKED, CHANNEL, [row('p1')]);
    await settle();
    expect(counts()[CHANNEL][TRACKED]).toBe(5);
  });
});
