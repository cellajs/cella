import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks must precede the import of the module under test.
vi.mock('../pipeline/process-events', () => ({ processFlush: vi.fn() }));

vi.mock('../pipeline/parse-message', () => ({
  parseMessage: vi.fn(() => ({
    activity: {
      action: 'update',
      entityType: 'task',
      resourceType: null,
      subjectId: 'gen-abc123',
      projectId: 'proj-1',
      organizationId: 'org-1',
      tableName: 'tasks',
      type: 'task.updated',
      tenantId: 'tenant-1',
      userId: 'user-1',
      changedFields: null,
      stx: null,
    },
    rowData: { id: 'gen-abc123' },
    oldRowData: null,
    tableMeta: { kind: 'entity', type: 'task', table: {} },
  })),
}));

vi.mock('../network/websocket-client', () => ({
  wsClient: { isConnected: vi.fn(() => true), connect: vi.fn(), send: vi.fn(() => true), setCallbacks: vi.fn() },
}));

import { handleDataMessage, resetBuffers } from '../pipeline/handle-message';
import { replicationState } from '../services/replication-state';
import { dmlMessage } from './factories';

const { parseMessage } = await import('../pipeline/parse-message');
const mocked = vi.mocked(parseMessage);
const { processFlush } = await import('../pipeline/process-events');

const mockDmlMessage = (tag: 'insert' | 'update' | 'delete', id: string) => dmlMessage(tag, 'tasks', { id });

describe('handleDataMessage: a worker that is behind', () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    vi.clearAllMocks();
  });

  it('measures how far it is behind from the commit time of the transaction it reads', async () => {
    // As the replication client reports it: microseconds since the Unix epoch.
    const commitTime = BigInt(Date.now() - 15_000) * 1000n;

    await handleDataMessage('0/1', { tag: 'begin', xid: 7, commitLsn: '0/9', commitTime });

    expect(replicationState.lagMs).toBeGreaterThanOrEqual(15_000);
    expect(replicationState.lagMs).toBeLessThan(20_000);
  });

  it('records every change while it is behind, whatever the id of the row', async () => {
    replicationState.lagMs = 15_000;

    // Ids as a seed script and a mock give them: such a row is a row like any other.
    await handleDataMessage('0/1', mockDmlMessage('insert', '00000000-1234-4abc-8def-123456789abc'));
    await handleDataMessage('0/2', mockDmlMessage('insert', 'gen-abc123'));
    await handleDataMessage('0/3', mockDmlMessage('update', 'gen-abc123'));
    await handleDataMessage('0/4', mockDmlMessage('delete', 'gen-abc123'));

    expect(mocked).toHaveBeenCalledTimes(4);
  });
});

describe('handleDataMessage: a message the parser drops', () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    vi.clearAllMocks();
  });

  it('acknowledges it at once when nothing earlier is buffered, for heartbeat replies', async () => {
    const acknowledge = vi.fn(async () => true);
    replicationState.service = { acknowledge } as unknown as typeof replicationState.service;

    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/7', mockDmlMessage('insert', 'usr-1'));

    expect(acknowledge).toHaveBeenCalledWith('0/7');
    expect(replicationState.lastAckedLsn).toBe('0/7');
  });

  it('leaves it unacknowledged while an earlier event waits for its flush', async () => {
    const acknowledge = vi.fn(async () => true);
    replicationState.service = { acknowledge } as unknown as typeof replicationState.service;

    // An event outside a transaction goes straight to the flush buffer, where it waits for the window to end.
    await handleDataMessage('0/5', mockDmlMessage('update', 'usr-1'));
    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/7', mockDmlMessage('insert', 'usr-2'));

    // Confirming 0/7 here would lose the event at 0/5 in a crash: the flush acknowledges past both.
    expect(acknowledge).not.toHaveBeenCalled();
    expect(replicationState.lastAckedLsn).toBeNull();
  });
});

describe("handleDataMessage: a change's place in its transaction", () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const begin = (commitLsn: string) => handleDataMessage(commitLsn, { tag: 'begin', xid: 7, commitLsn, commitTime: BigInt(0) });
  const commit = (lsn: string) => handleDataMessage(lsn, { tag: 'commit' } as never);

  /** Every event handed to a flush, as its transaction's commit position and its index there. */
  const flushed = () =>
    vi.mocked(processFlush).mock.calls.flatMap(([transactions]) => transactions.flat().map(({ commitLsn, index }) => `${commitLsn}#${index}`));

  it('gives each change its transaction commit position and its index there', async () => {
    await begin('0/90');
    // A COPY writes a page of rows in one WAL record: each arrives with that record's LSN, and its own index.
    for (const id of ['usr-1', 'usr-2', 'usr-3']) await handleDataMessage('0/10', mockDmlMessage('insert', id));
    await commit('0/90');
    await begin('0/A0');
    await handleDataMessage('0/20', mockDmlMessage('insert', 'usr-4'));
    await commit('0/A0');
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/90#0', '0/90#1', '0/90#2', '0/A0#0']);
  });

  it('counts a change it skips, so the next one has the same index on every delivery', async () => {
    await begin('0/90');
    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await handleDataMessage('0/11', mockDmlMessage('insert', 'usr-2'));
    await commit('0/90');
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/90#1']);
  });

  it('counts from the start again for a new subscription', async () => {
    await begin('0/90');
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    // The stream starts over at the confirmed position and delivers the same transaction again.
    resetBuffers();
    await begin('0/90');
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await commit('0/90');
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/90#0']);
  });
});

describe('handleDataMessage: a message it cannot handle', () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    vi.clearAllMocks();
  });

  const serviceWith = (acknowledge = vi.fn(async () => true)) => {
    const stop = vi.fn(async () => {});
    replicationState.service = { acknowledge, stop } as unknown as typeof replicationState.service;
    return { acknowledge, stop };
  };

  it('fails the subscription at that position: the stream is read again, nothing is dropped', async () => {
    const { stop } = serviceWith();
    mocked.mockImplementationOnce(() => {
      throw new Error('column "payload" has a value the parser cannot read');
    });

    await handleDataMessage('0/30', mockDmlMessage('insert', 'usr-1'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(replicationState.failure).toMatchObject({ position: '0/30', count: 1, passing: false });
  });

  it('must not confirm a later position via a message it skips after the failure', async () => {
    const { acknowledge } = serviceWith();
    mocked.mockImplementationOnce(() => {
      throw new Error('unreadable');
    });
    await handleDataMessage('0/30', mockDmlMessage('insert', 'usr-1'));

    // The service is still delivering what it had queued: a message with nothing to record would be confirmed at once.
    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/40', mockDmlMessage('insert', 'usr-2'));

    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('confirms a skipped message when nothing failed (positive control)', async () => {
    const { acknowledge } = serviceWith();
    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/40', mockDmlMessage('insert', 'usr-2'));

    expect(acknowledge).toHaveBeenCalledWith('0/40');
  });
});
