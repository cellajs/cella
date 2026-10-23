import '~/query/tests/query-client-env';
import { appConfig, hierarchy } from 'shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryClient } = await import('~/query/query-client');
const { isSeenTracked, seenKeys } = await import('./helpers');
const { seenStore } = await import('./seen-store');
const { applyUnfetchableRemovalUnseen, ingestSyncedRows, noteUnseenReconciled, subscribeUnseenSync } = await import('./unseen-sync');
const { publishSyncedRows } = await import('~/query/realtime/sync-signals');

// Tracked type and effective home come from config, so the fixture works across app hierarchies.
const tracked = appConfig.seenTrackedProductTypes[0];
const ancestors = hierarchy.getOrderedAncestors(tracked); // deepest → root
const ancestorId = Object.fromEntries(ancestors.map((type) => [type, `ch-${type}`]));
const channel = ancestorId[ancestors[0]]; // deepest ancestor id (the home channel)
const org = ancestorId[ancestors[ancestors.length - 1]]; // root ancestor (organization) id
const untracked = appConfig.productEntityTypes.find((type) => !isSeenTracked(type));

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ...Object.fromEntries(ancestors.map((type) => [appConfig.entityIdColumnKeys[type], ancestorId[type]])),
  createdAt: now(),
  deletedAt: null,
  ...overrides,
});

const counts = () => (queryClient.getQueryData(seenKeys.unseenCounts) as Record<string, Record<string, number>>) ?? {};

/** Flush deltas batched by the idle callback (setTimeout fallback outside the browser). */
const settle = () => vi.advanceTimersByTimeAsync(5_100);

describe('unseen count deltas from synced rows', () => {
  // If tracked ever stops being seen-tracked, every "count did not change" assertion below passes vacuously.
  beforeAll(() => {
    expect(isSeenTracked(tracked)).toBe(true);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient.setQueryData(seenKeys.unseenCounts, { [channel]: { [tracked]: 5 } });
    seenStore.getState().reset();
    noteUnseenReconciled();
  });

  afterEach(() => {
    queryClient.removeQueries({ queryKey: seenKeys.unseenCounts });
    vi.useRealTimers();
  });

  it('counts a new unseen row once, even when it reappears in later ranges (created, then updated)', async () => {
    vi.advanceTimersByTime(10); // created after the reconcile anchor
    ingestSyncedRows(tracked, channel, [row('a1')]);
    ingestSyncedRows(tracked, channel, [row('a1')]); // same row, next range
    await settle();

    expect(counts()[channel][tracked]).toBe(6);
  });

  it('does not count rows already covered by the exact baseline (created before the reconcile anchor)', async () => {
    ingestSyncedRows(tracked, channel, [row('old-1', { createdAt: daysAgo(1) })]);
    await settle();

    expect(counts()[channel][tracked]).toBe(5);
  });

  it('does not count rows outside the seen window or rows this client already saw', async () => {
    vi.advanceTimersByTime(10);
    seenStore
      .getState()
      .markProductSeen({ tenantId: 'tenant-1', organizationId: org, channelId: channel, productType: tracked, productId: 'seen-1' });
    await settle(); // markProductSeen itself queued a -1 (5 → 4)

    ingestSyncedRows(tracked, channel, [
      row('ancient', { createdAt: daysAgo(120) }), // outside 90-day window
      row('seen-1'), // locally seen
    ]);
    await settle();

    expect(counts()[channel][tracked]).toBe(4);
  });

  it('decrements for a tombstoned baseline row, and nets zero for a row it counted itself', async () => {
    ingestSyncedRows(tracked, channel, [row('base-1', { createdAt: daysAgo(1), deletedAt: now() })]);
    await settle();
    expect(counts()[channel][tracked]).toBe(4);

    vi.advanceTimersByTime(10);
    ingestSyncedRows(tracked, channel, [row('live-1')]);
    await settle();
    expect(counts()[channel][tracked]).toBe(5);
    ingestSyncedRows(tracked, channel, [row('live-1', { deletedAt: now() })]);
    await settle();
    expect(counts()[channel][tracked]).toBe(4);
  });

  it('reconcile wins wholesale: after noteUnseenReconciled, re-ingested rows are baseline rows', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows(tracked, channel, [row('a2')]);
    await settle();
    expect(counts()[channel][tracked]).toBe(6);

    noteUnseenReconciled(); // exact recount replaced the cache; anchor moves forward
    ingestSyncedRows(tracked, channel, [row('a2')]); // same row again → baseline's job now
    await settle();
    expect(counts()[channel][tracked]).toBe(6);
  });

  it('unfetchable removal decrements unseen rows and nets zero for locally-seen ones', async () => {
    applyUnfetchableRemovalUnseen(tracked, 'gone-1', channel); // unseen → −1
    await settle();
    expect(counts()[channel][tracked]).toBe(4);

    seenStore
      .getState()
      .markProductSeen({ tenantId: 'tenant-1', organizationId: org, channelId: channel, productType: tracked, productId: 'gone-2' });
    await settle(); // view-mark −1 (4 → 3)
    applyUnfetchableRemovalUnseen(tracked, 'gone-2', channel); // seen → net 0
    await settle();
    expect(counts()[channel][tracked]).toBe(3);
  });

  it('derives the channel from the row (deepest ancestor id), falling back to the passed channel', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows(tracked, 'fallback-ch', [
      row('c1'), // row's own home ancestor id wins over the fallback
      { id: 'c2', createdAt: now(), deletedAt: null }, // no ancestor id on the row → fallback
    ]);
    await settle();

    expect(counts()[channel][tracked]).toBe(6);
    expect(counts()['fallback-ch'][tracked]).toBe(1);
  });

  it('publish lights the badge: recency keys on publishedAt, not the old createdAt', async () => {
    vi.advanceTimersByTime(10);
    // createdAt is outside the window and before the reconcile anchor; the recent publishedAt still counts it as new.
    ingestSyncedRows(tracked, channel, [row('pub-1', { createdAt: daysAgo(100), publishedAt: now() })]);
    await settle();

    expect(counts()[channel][tracked]).toBe(6);
  });

  it('never counts an unpublished draft (defense in depth: drafts do not sync at all)', async () => {
    vi.advanceTimersByTime(10);
    ingestSyncedRows(tracked, channel, [row('draft-1', { publishedAt: null })]);
    await settle();

    expect(counts()[channel][tracked]).toBe(5);
  });

  it('ignores untracked product types', async () => {
    if (!untracked) return;
    ingestSyncedRows(untracked, channel, [row('p1')]);
    await settle();
    expect(counts()[channel][tracked]).toBe(5);
  });

  it('ingests delivered rows from the synced-rows signal and skips degraded ranges', async () => {
    const off = subscribeUnseenSync();
    vi.advanceTimersByTime(10);
    publishSyncedRows({ entityType: tracked, organizationId: org, rows: [row('s1')], degraded: false });
    publishSyncedRows({ entityType: tracked, organizationId: org, rows: [row('s2')], degraded: true });
    off();
    await settle();
    expect(counts()[channel][tracked]).toBe(6);
  });
});
