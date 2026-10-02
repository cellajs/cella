import * as decoding from 'lib0/decoding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { PARKED_GRACE_MS, RESYNC_COOLDOWN_MS, watchPendingStructs } from '../yjs-resync';

function fakeDoc(): Y.Doc & { park: (on: boolean) => void } {
  const doc = new Y.Doc();
  doc.getText('t').insert(0, 'held');
  const store = doc.store as unknown as { pendingStructs: unknown };
  return Object.assign(doc, { park: (on: boolean) => (store.pendingStructs = on ? { missing: new Map() } : null) });
}

/** A live provider's socket; a resync must neither close nor reopen it. */
function fakeProvider(connected = true) {
  return { wsconnected: connected, ws: { send: vi.fn() }, disconnect: vi.fn(), connect: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchPendingStructs', () => {
  it('sends a fresh Step1 on the live socket once structs have stayed parked past the grace period, without reconnecting', () => {
    const doc = fakeDoc();
    const provider = fakeProvider();
    const stop = watchPendingStructs(doc, provider);

    vi.advanceTimersByTime(5_000);
    expect(provider.ws.send).not.toHaveBeenCalled();

    // The park is noticed on the next poll; the grace period counts from there.
    doc.park(true);
    vi.advanceTimersByTime(PARKED_GRACE_MS);
    expect(provider.ws.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(1);
    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(provider.connect).not.toHaveBeenCalled();

    // A sync message (0) with a Step1 (0) carrying the document's state vector.
    const decoder = decoding.createDecoder(provider.ws.send.mock.calls[0][0]);
    expect(decoding.readVarUint(decoder)).toBe(0);
    expect(decoding.readVarUint(decoder)).toBe(0);
    expect(decoding.readVarUint8Array(decoder)).toEqual(Y.encodeStateVector(doc));
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
    expect(provider.ws.send).not.toHaveBeenCalled();

    doc.park(true);
    vi.advanceTimersByTime(1_500);
    expect(provider.ws.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_500);
    expect(provider.ws.send).toHaveBeenCalledTimes(1);
    stop();
  });

  it('respects the cooldown between resyncs and waits for a live connection', () => {
    const doc = fakeDoc();
    const provider = fakeProvider(false);
    const stop = watchPendingStructs(doc, provider);

    doc.park(true);
    vi.advanceTimersByTime(PARKED_GRACE_MS + 2_000);
    expect(provider.ws.send).not.toHaveBeenCalled();

    provider.wsconnected = true;
    vi.advanceTimersByTime(1_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(1);

    // Still parked: the next attempt waits for the cooldown, not just the grace period.
    vi.advanceTimersByTime(RESYNC_COOLDOWN_MS - 2_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops polling once released', () => {
    const doc = fakeDoc();
    const provider = fakeProvider();
    const stop = watchPendingStructs(doc, provider);
    stop();
    doc.park(true);
    vi.advanceTimersByTime(60_000);
    expect(provider.ws.send).not.toHaveBeenCalled();
  });
});
