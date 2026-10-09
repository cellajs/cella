import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({ cdcDb: {} }));
vi.mock('../pipeline/handle-message', () => ({ FENCE_MARKER_PREFIX: 'sync-fence', runBetweenFlushes: vi.fn() }));

import { compareBooks } from '../pipeline/verify';
import { addCounts, type CounterDeltas, fence, isVisibleIn, parseSnapshot, plainCounts } from '../services/fence';

const counters = (entries: Record<string, Record<string, number>>): CounterDeltas => new Map(Object.entries(entries));

describe('isVisibleIn: did a count from the tables already see a transaction', () => {
  const snapshot = parseSnapshot('100:110:103,107');

  it.each([
    [99, true, 'finished before the oldest transaction still running'],
    [101, true, 'finished while others ran'],
    [103, false, 'still running when the snapshot was taken'],
    [107, false, 'still running when the snapshot was taken'],
    [109, true, 'the last one to finish before the snapshot'],
    [110, false, 'had not started'],
    [500, false, 'started long after'],
  ])('transaction %i: %s (%s)', (xid, visible) => {
    expect(isVisibleIn(xid, snapshot)).toBe(visible);
  });

  it('reads a snapshot without running transactions', () => {
    expect(parseSnapshot('100:100:')).toEqual({ xmin: 100n, xmax: 100n, xip: new Set() });
    expect(isVisibleIn(99, parseSnapshot('100:100:'))).toBe(true);
    expect(isVisibleIn(100, parseSnapshot('100:100:'))).toBe(false);
  });

  it('places a 32-bit id from the stream in the epoch of a 64-bit snapshot', () => {
    // The counter has wrapped twice: ids in the snapshot carry the epoch, the stream's id does not.
    const epoch = 2n << 32n;
    const wrapped = parseSnapshot(`${epoch + 100n}:${epoch + 110n}:${epoch + 103n}`);

    expect(isVisibleIn(101, wrapped)).toBe(true);
    expect(isVisibleIn(103, wrapped)).toBe(false);
    expect(isVisibleIn(110, wrapped)).toBe(false);
  });

  it('places an id from just before a wrap in the epoch before the snapshot', () => {
    const justWrapped = parseSnapshot(`${(1n << 32n) - 5n}:${(1n << 32n) + 3n}:`);

    // 4294967290 is 6 below the wrap: it finished before the snapshot's oldest.
    expect(isVisibleIn(4294967290, justWrapped)).toBe(true);
    // 2 is in the new epoch and below xmax: visible. 3 is xmax itself: not.
    expect(isVisibleIn(2, justWrapped)).toBe(true);
    expect(isVisibleIn(3, justWrapped)).toBe(false);
  });
});

describe('fence', () => {
  it('knows no transaction while no count is open', () => {
    fence.close();
    expect(fence.sawTransaction(1)).toBe(false);
    expect(fence.mode).toBeNull();
  });

  it('adds up what the count already saw, and is passed when its own marker arrives', async () => {
    fence.open('verify', '100:110:', 'marker-1');
    let passed = false;
    void fence.whenPassed().then((streamPassed) => {
      passed = streamPassed;
    });

    expect(fence.sawTransaction(101)).toBe(true);
    expect(fence.sawTransaction(110)).toBe(false);
    // An event outside a transaction has no id: it cannot have been counted.
    expect(fence.sawTransaction(undefined)).toBe(false);
    fence.addCounted(counters({ org: { 'e:c:attachment': 2 } }));
    fence.addCounted(counters({ org: { 'e:c:attachment': -1, 'm:c:total': 1 } }));

    fence.markerArrived('a-marker-of-another-count');
    await Promise.resolve();
    expect(passed).toBe(false);

    fence.markerArrived('marker-1');
    await Promise.resolve();
    expect(passed).toBe(true);
    expect(fence.close()).toEqual(counters({ org: { 'e:c:attachment': 1, 'm:c:total': 1 } }));
  });

  it('must not keep a verify waiting whose fence a rebuild took over: it learns that the stream did not pass it', async () => {
    fence.open('verify', '100:110:', 'marker-of-the-verify');
    const verifyPassed = fence.whenPassed();

    fence.open('rebuild', '120:130:', 'marker-of-the-rebuild');

    expect(await verifyPassed).toBe(false);
    expect(fence.marker).toBe('marker-of-the-rebuild');
    // The verify's marker still arrives in the stream: it is not the open fence's, and passes nothing.
    fence.markerArrived('marker-of-the-verify');
    const rebuildPassed = fence.whenPassed();
    fence.markerArrived('marker-of-the-rebuild');
    expect(await rebuildPassed).toBe(true);
    fence.close();
  });

  it('tells whoever waits that a fence was closed before the stream passed it', async () => {
    fence.open('verify', '100:110:', 'marker-1');
    const passed = fence.whenPassed();

    fence.close();

    expect(await passed).toBe(false);
    expect(fence.marker).toBeNull();
    expect(await fence.whenPassed()).toBe(false);
  });
});

describe('plainCounts and addCounts', () => {
  it('keeps the counts and leaves out the stamps, the frontiers and the signal', () => {
    const deltas = counters({
      org: { 'e:c:attachment': 2, 'e:c:h:attachment': 2, 'm:c:total': 1, 'e:f:attachment': 40, 'e:li:h:attachment': 17, membership: 1, sequence: 3 },
    });

    expect(plainCounts(deltas)).toEqual(counters({ org: { 'e:c:attachment': 2, 'e:c:h:attachment': 2, 'm:c:total': 1 } }));
  });

  it('takes what was already counted out of a plan', () => {
    const plan = counters({ org: { 'e:c:attachment': 3, 'e:f:attachment': 40 } });
    addCounts(plan, counters({ org: { 'e:c:attachment': 2 } }), -1);

    expect(plan).toEqual(counters({ org: { 'e:c:attachment': 1, 'e:f:attachment': 40 } }));
  });
});

describe('compareBooks', () => {
  const stored = counters({ org: { 'e:c:attachment': 5, 'm:c:total': 3, sequence: 40, 'e:f:attachment': 40, membership: 7 } });

  it('finds nothing when the stored counts plus what the count already saw equal the count', () => {
    // Two creates committed before the snapshot and were recorded after it.
    const counted = counters({ org: { 'e:c:attachment': 7, 'm:c:total': 3, sequence: 40, 'e:f:attachment': 40 } });

    expect(compareBooks(stored, counted, counters({ org: { 'e:c:attachment': 2 } }))).toEqual([]);
  });

  it('must not accept a count that differs, and says by how much', () => {
    const counted = counters({ org: { 'e:c:attachment': 7, 'm:c:total': 2, sequence: 40, 'e:f:attachment': 40 } });

    expect(compareBooks(stored, counted, new Map())).toEqual([
      { channelKey: 'org', key: 'e:c:attachment', stored: 5, counted: 7 },
      { channelKey: 'org', key: 'm:c:total', stored: 3, counted: 2 },
    ]);
  });

  it('must not accept a sequence counter or a frontier below a value the tables hold', () => {
    const counted = counters({ org: { 'e:c:attachment': 5, 'm:c:total': 3, sequence: 44, 'e:f:attachment': 44 } });

    expect(compareBooks(stored, counted, new Map())).toEqual([
      { channelKey: 'org', key: 'sequence', stored: 40, counted: 44 },
      { channelKey: 'org', key: 'e:f:attachment', stored: 40, counted: 44 },
    ]);
  });

  it('accepts a sequence counter ahead of the tables: its values went to rows that are gone', () => {
    const counted = counters({ org: { 'e:c:attachment': 5, 'm:c:total': 3, sequence: 31, 'e:f:attachment': 31 } });

    expect(compareBooks(stored, counted, new Map())).toEqual([]);
  });

  it('counts a key the tables give no row for as zero', () => {
    const counted = counters({ org: { 'm:c:total': 3, sequence: 40 } });

    expect(compareBooks(stored, counted, new Map())).toEqual([{ channelKey: 'org', key: 'e:c:attachment', stored: 5, counted: 0 }]);
  });

  it('counts a channel without a stored row from zero', () => {
    const counted = counters({ fresh: { 'e:c:attachment': 1, sequence: 9 } });

    expect(compareBooks(new Map(), counted, new Map())).toEqual([
      { channelKey: 'fresh', key: 'e:c:attachment', stored: 0, counted: 1 },
      { channelKey: 'fresh', key: 'sequence', stored: 0, counted: 9 },
    ]);
  });

  it('leaves the counter row of a channel that is gone alone', () => {
    expect(compareBooks(counters({ gone: { 'e:c:attachment': 4 } }), new Map(), new Map())).toEqual([]);
  });
});
