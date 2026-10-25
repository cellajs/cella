import * as decoding from 'lib0/decoding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { parkedGraceMs, resyncCooldownMs, watchPendingStructs } from '~/modules/common/blocknote/yjs-resync';

function fakeDoc(): Y.Doc & { park: (on: boolean) => void } {
  const doc = new Y.Doc();
  doc.getText('t').insert(0, 'held');
  const store = doc.store as unknown as { pendingStructs: unknown };
  return Object.assign(doc, { park: (on: boolean) => (store.pendingStructs = on ? { missing: new Map() } : null) });
}

/** A live provider's socket; a resync must neither close nor reopen it. */
function fakeProvider() {
  return { wsconnected: true, ws: { send: vi.fn() }, disconnect: vi.fn(), connect: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchPendingStructs', () => {
  it('resyncs a document stuck on a lost update with a Step1 on the live socket: once parked past the grace period, at most once per cooldown, never reconnecting', () => {
    const doc = fakeDoc();
    const provider = fakeProvider();
    const stop = watchPendingStructs(doc, provider);

    // A park that clears within the grace period never triggers.
    doc.park(true);
    vi.advanceTimersByTime(1_000);
    doc.park(false);
    vi.advanceTimersByTime(3_000);
    expect(provider.ws.send).not.toHaveBeenCalled();

    // A new park restarts the grace period, counted from the poll that notices it.
    doc.park(true);
    vi.advanceTimersByTime(parkedGraceMs);
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

    // Still parked: the next one waits for the cooldown, and for a live socket.
    vi.advanceTimersByTime(resyncCooldownMs - 1_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(1);
    provider.wsconnected = false;
    vi.advanceTimersByTime(2_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(1);
    provider.wsconnected = true;
    vi.advanceTimersByTime(1_000);
    expect(provider.ws.send).toHaveBeenCalledTimes(2);
    stop();
  });
});
