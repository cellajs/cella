import type { YjsDocScope } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { yjsFinishDelayMs } from '../constants';
import { deferred, flushMicrotasks, mockScope, mockWebSocket, storageMock } from './helpers';

vi.mock('../data/storage', () => storageMock());
vi.mock('../sync/compaction', () => ({ compactDocument: vi.fn().mockResolvedValue('ok') }));

const { materializeOrphanedLogs, startPeriodicSweep } = await import('../sync/sweep');
const { findStaleDocuments, retireDocument } = await import('../data/storage');
const { compactDocument } = await import('../sync/compaction');
const { getCollab, joinCollab, withDocumentLock } = await import('../sync/session-manager');

const staleRow = (overrides: Partial<YjsDocScope> = {}): YjsDocScope => ({
  entityType: 'attachment',
  entityId: 'entity-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('materializeOrphanedLogs', () => {
  it('must not delete the document rows it writes: every unwritten log goes through the shared routine, and the rows stay', async () => {
    vi.mocked(findStaleDocuments).mockResolvedValueOnce([staleRow(), staleRow({ entityId: 'entity-2', organizationId: 'org-2' })]);

    await materializeOrphanedLogs();

    expect(compactDocument).toHaveBeenCalledTimes(2);
    // As the system, in the scope the row stored: no user context.
    expect(compactDocument).toHaveBeenCalledWith(staleRow(), null);
    expect(compactDocument).toHaveBeenCalledWith(staleRow({ entityId: 'entity-2', organizationId: 'org-2' }), null);
    expect(retireDocument).not.toHaveBeenCalled();
    expect(getCollab(staleRow())).toBeUndefined();
  });

  it('deletes the rows of a document whose entity is gone', async () => {
    vi.mocked(findStaleDocuments).mockResolvedValueOnce([staleRow()]);
    vi.mocked(compactDocument).mockResolvedValueOnce('gone');
    await materializeOrphanedLogs();
    expect(retireDocument).toHaveBeenCalledWith(staleRow());
  });

  it('keeps the log when it was not written or compaction throws', async () => {
    vi.mocked(findStaleDocuments).mockResolvedValueOnce([staleRow(), staleRow({ entityId: 'entity-2' })]);
    vi.mocked(compactDocument).mockResolvedValueOnce('retry').mockRejectedValueOnce(new Error('db down'));
    await materializeOrphanedLogs();
    expect(retireDocument).not.toHaveBeenCalled();
  });

  it('skips a document that has a live session in this process', async () => {
    const live = mockScope({ entityId: 'entity-live' });
    joinCollab(live, mockWebSocket() as never);
    vi.mocked(findStaleDocuments).mockResolvedValueOnce([staleRow({ entityId: 'entity-live' })]);
    await materializeOrphanedLogs();
    expect(compactDocument).not.toHaveBeenCalled();
    expect(retireDocument).not.toHaveBeenCalled();
  });

  it('a socket that joins while the sweep writes keeps the session, and its handshake waits for the write', async () => {
    const doc = staleRow({ entityId: 'entity-joining' });
    vi.mocked(findStaleDocuments).mockResolvedValueOnce([doc]);
    const compaction = deferred();
    vi.mocked(compactDocument).mockImplementationOnce(async () => {
      await compaction.promise;
      return 'ok';
    });
    const sweep = materializeOrphanedLogs();
    await flushMicrotasks();
    expect(compactDocument).toHaveBeenCalledTimes(1);

    // A socket joins after the listing, while the sweep's compaction writes; its handshake takes the document lock.
    const joiner = mockWebSocket();
    const session = joinCollab(mockScope({ entityId: 'entity-joining' }), joiner as never);
    const handshake = vi.fn();
    const handshakeDone = withDocumentLock(session, async () => handshake());
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
    vi.mocked(findStaleDocuments).mockRejectedValueOnce(new Error('db down'));
    await expect(materializeOrphanedLogs()).resolves.toBeUndefined();
    expect(compactDocument).not.toHaveBeenCalled();
  });
});

describe('the periodic sweep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sweeps every yjsFinishDelayMs while the relay stays up, so rows posted over HTTP are written without a restart (D15)', async () => {
    vi.useFakeTimers();
    const doc = staleRow({ entityId: 'entity-posted' });
    vi.mocked(findStaleDocuments).mockResolvedValueOnce([]).mockResolvedValueOnce([doc]);
    const stop = startPeriodicSweep();
    try {
      await vi.advanceTimersByTimeAsync(yjsFinishDelayMs);
      expect(findStaleDocuments).toHaveBeenCalledTimes(1);
      expect(compactDocument).not.toHaveBeenCalled();

      // The rows posted since are listed once they are older than the grace, at the next run.
      await vi.advanceTimersByTimeAsync(yjsFinishDelayMs);
      expect(findStaleDocuments).toHaveBeenCalledTimes(2);
      expect(findStaleDocuments).toHaveBeenLastCalledWith(yjsFinishDelayMs);
      expect(compactDocument).toHaveBeenCalledWith(doc, null);
    } finally {
      stop();
    }

    // Stopped, as at shutdown: no run comes due.
    await vi.advanceTimersByTimeAsync(3 * yjsFinishDelayMs);
    expect(findStaleDocuments).toHaveBeenCalledTimes(2);
  });

  it('must not run two sweeps at once: a run that comes due while one runs joins it', async () => {
    const listing = deferred();
    vi.mocked(findStaleDocuments).mockImplementationOnce(async () => {
      await listing.promise;
      return [staleRow({ entityId: 'entity-once' })];
    });

    const first = materializeOrphanedLogs();
    const second = materializeOrphanedLogs();
    expect(second).toBe(first);
    listing.release();
    await first;
    expect(findStaleDocuments).toHaveBeenCalledTimes(1);
    expect(compactDocument).toHaveBeenCalledTimes(1);

    // Positive control: once it ended, the next run lists again.
    await materializeOrphanedLogs();
    expect(findStaleDocuments).toHaveBeenCalledTimes(2);
  });

  it('keeps sweeping after a run that failed', async () => {
    vi.useFakeTimers();
    vi.mocked(findStaleDocuments).mockRejectedValueOnce(new Error('db down'));
    const stop = startPeriodicSweep();
    try {
      await vi.advanceTimersByTimeAsync(2 * yjsFinishDelayMs);
      expect(findStaleDocuments).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });
});
