import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import { PARKED_GRACE_MS, RESYNC_COOLDOWN_MS, watchPendingStructs } from '../yjs-resync';

function fakeDoc(): Y.Doc & { park: (on: boolean) => void } {
  const store = { pendingStructs: null as unknown };
  return { store, park: (on: boolean) => (store.pendingStructs = on ? { missing: new Map() } : null) } as never;
}

function fakeProvider(connected = true) {
  return { wsconnected: connected, disconnect: vi.fn(), connect: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchPendingStructs', () => {
  it('reconnects once structs have stayed parked past the grace period while connected', () => {
    const doc = fakeDoc();
    const provider = fakeProvider();
    const stop = watchPendingStructs(doc, provider);

    vi.advanceTimersByTime(5_000);
    expect(provider.disconnect).not.toHaveBeenCalled();

    // The park is noticed on the next poll; the grace period counts from there.
    doc.park(true);
    vi.advanceTimersByTime(PARKED_GRACE_MS);
    expect(provider.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(provider.connect).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a park that clears in time never triggers, and a new park restarts the grace period', () => {
    const doc = fakeDoc();
    const provider = fakeProvider();
    const stop = watchPendingStructs(doc, provider);

    doc.park(true);
    vi.advanceTimersByTime(1_000);
    doc.park(false);
    vi.advanceTimersByTime(3_000);
    expect(provider.disconnect).not.toHaveBeenCalled();

    doc.park(true);
    vi.advanceTimersByTime(1_500);
    expect(provider.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_500);
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    stop();
  });

  it('respects the cooldown between resyncs and waits for a live connection', () => {
    const doc = fakeDoc();
    const provider = fakeProvider(false);
    const stop = watchPendingStructs(doc, provider);

    doc.park(true);
    vi.advanceTimersByTime(PARKED_GRACE_MS + 2_000);
    expect(provider.disconnect).not.toHaveBeenCalled();

    provider.wsconnected = true;
    vi.advanceTimersByTime(1_000);
    expect(provider.disconnect).toHaveBeenCalledTimes(1);

    // Still parked: the next attempt waits for the cooldown, not just the grace period.
    vi.advanceTimersByTime(RESYNC_COOLDOWN_MS - 2_000);
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000);
    expect(provider.disconnect).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops polling once released', () => {
    const doc = fakeDoc();
    const provider = fakeProvider();
    const stop = watchPendingStructs(doc, provider);
    stop();
    doc.park(true);
    vi.advanceTimersByTime(60_000);
    expect(provider.disconnect).not.toHaveBeenCalled();
  });
});
