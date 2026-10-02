import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { deferred, flushMicrotasks, mockScope, mockWebSocket, storageMock } from './helpers';

vi.mock('../data/storage', () => storageMock());
vi.mock('../sync/compaction', () => ({ compactDocument: vi.fn().mockResolvedValue('ok') }));

const { runSweep, startPeriodicSweep } = await import('../sync/sweep');
const { listStaleDocs, deleteDoc } = await import('../data/storage');
const { compactDocument } = await import('../sync/compaction');
const { getCollab, joinCollab, withDocLock } = await import('../sync/session-manager');

const staleRow = (overrides: Record<string, unknown> = {}) => ({
  entityType: 'task',
  entityId: 'entity-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runSweep', () => {
  it('must not delete the document rows it writes: every unwritten log goes through the shared routine, and the rows stay', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow(), staleRow({ entityId: 'entity-2', organizationId: null })]);

    await runSweep();

    expect(compactDocument).toHaveBeenCalledTimes(2);
    // As the system, in the scope the row stored: no user context.
    expect(compactDocument).toHaveBeenCalledWith(staleRow(), null);
    expect(compactDocument).toHaveBeenCalledWith(staleRow({ entityId: 'entity-2', organizationId: null }), null);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(getCollab(staleRow())).toBeUndefined();
  });

  it('deletes the rows of a document whose entity is gone', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow()]);
    vi.mocked(compactDocument).mockResolvedValueOnce('gone');
    await runSweep();
    expect(deleteDoc).toHaveBeenCalledWith(staleRow());
  });

  it('keeps the log when it was not written or compaction throws', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow(), staleRow({ entityId: 'entity-2' }), staleRow({ entityId: 'entity-3' })]);
    vi.mocked(compactDocument).mockResolvedValueOnce('retry').mockResolvedValueOnce('permanent').mockRejectedValueOnce(new Error('db down'));
    await runSweep();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('skips a document that has a live session in this process', async () => {
    const live = mockScope({ entityId: 'entity-live' });
    joinCollab(live, mockWebSocket() as never);
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow({ entityId: 'entity-live' })]);
    await runSweep();
    expect(compactDocument).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('a socket that joins while the sweep writes keeps the session, and its handshake waits for the write', async () => {
    const doc = staleRow({ entityId: 'entity-joining' });
    vi.mocked(listStaleDocs).mockResolvedValueOnce([doc]);
    const compaction = deferred();
    vi.mocked(compactDocument).mockImplementationOnce(async () => {
      await compaction.promise;
      return 'ok';
    });
    const sweep = runSweep();
    await flushMicrotasks();
    expect(compactDocument).toHaveBeenCalledTimes(1);

    // A socket joins after the listing, while the sweep's compaction writes; its handshake takes the document lock.
    const joiner = mockWebSocket();
    const session = joinCollab(mockScope({ entityId: 'entity-joining' }), joiner as never);
    const handshake = vi.fn();
    const handshakeDone = withDocLock(session, async () => handshake());
    await flushMicrotasks();
    expect(handshake).not.toHaveBeenCalled();

    compaction.release();
    await sweep;
    await handshakeDone;

    // The handshake reads the document once the compaction folded it, and the joiner's session stays.
    expect(handshake).toHaveBeenCalledTimes(1);
    expect(getCollab(doc)).toBe(session);
    expect(session.clients.has(joiner as never)).toBe(true);
  });

  it('a listing failure is logged and the sweep returns', async () => {
    vi.mocked(listStaleDocs).mockRejectedValueOnce(new Error('db down'));
    await expect(runSweep()).resolves.toBeUndefined();
    expect(compactDocument).not.toHaveBeenCalled();
  });
});

describe('the periodic sweep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sweeps every YJS_CLEANUP_DELAY_MS while the relay stays up, so rows posted over HTTP are written without a restart (D15)', async () => {
    vi.useFakeTimers();
    const doc = staleRow({ entityId: 'entity-posted' });
    vi.mocked(listStaleDocs).mockResolvedValueOnce([]).mockResolvedValueOnce([doc]);
    const stop = startPeriodicSweep();
    try {
      await vi.advanceTimersByTimeAsync(YJS_CLEANUP_DELAY_MS);
      expect(listStaleDocs).toHaveBeenCalledTimes(1);
      expect(compactDocument).not.toHaveBeenCalled();

      // The rows posted since are listed once they are older than the grace, at the next run.
      await vi.advanceTimersByTimeAsync(YJS_CLEANUP_DELAY_MS);
      expect(listStaleDocs).toHaveBeenCalledTimes(2);
      expect(listStaleDocs).toHaveBeenLastCalledWith(YJS_CLEANUP_DELAY_MS);
      expect(compactDocument).toHaveBeenCalledWith(doc, null);
    } finally {
      stop();
    }

    // Stopped, as at shutdown: no run comes due.
    await vi.advanceTimersByTimeAsync(3 * YJS_CLEANUP_DELAY_MS);
    expect(listStaleDocs).toHaveBeenCalledTimes(2);
  });

  it('must not run two sweeps at once: a run that comes due while one runs joins it', async () => {
    const listing = deferred();
    vi.mocked(listStaleDocs).mockImplementationOnce(async () => {
      await listing.promise;
      return [staleRow({ entityId: 'entity-once' })];
    });

    const first = runSweep();
    const second = runSweep();
    expect(second).toBe(first);
    listing.release();
    await first;
    expect(listStaleDocs).toHaveBeenCalledTimes(1);
    expect(compactDocument).toHaveBeenCalledTimes(1);

    // Positive control: once it ended, the next run lists again.
    await runSweep();
    expect(listStaleDocs).toHaveBeenCalledTimes(2);
  });

  it('keeps sweeping after a run that failed', async () => {
    vi.useFakeTimers();
    vi.mocked(listStaleDocs).mockRejectedValueOnce(new Error('db down'));
    const stop = startPeriodicSweep();
    try {
      await vi.advanceTimersByTimeAsync(2 * YJS_CLEANUP_DELAY_MS);
      expect(listStaleDocs).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
