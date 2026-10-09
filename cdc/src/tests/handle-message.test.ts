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

    expect(replicationState.lastLagMs).toBeGreaterThanOrEqual(15_000);
    expect(replicationState.lastLagMs).toBeLessThan(20_000);
    expect(replicationState.catchingUp).toBe(true);
  });

  it('records every change while it is behind, whatever the id of the row', async () => {
    replicationState.updateLag(15_000);
    expect(replicationState.catchingUp).toBe(true);

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

describe('handleDataMessage: changes that share an LSN', () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Every event handed to a flush, as its LSN and ordinal. */
  const flushed = () =>
    vi.mocked(processFlush).mock.calls.flatMap(([transactions]) => transactions.flat().map(({ lsn, ordinal }) => `${lsn}#${ordinal}`));

  it('tells the rows of one WAL record apart by their ordinal', async () => {
    // A COPY writes a page of rows in one record: each arrives with that record's LSN.
    for (const id of ['usr-1', 'usr-2', 'usr-3']) await handleDataMessage('0/10', mockDmlMessage('insert', id));
    await handleDataMessage('0/20', mockDmlMessage('insert', 'usr-4'));
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/10#0', '0/10#1', '0/10#2', '0/20#0']);
  });

  it('counts a change it skips, so the next one has the same ordinal on every delivery', async () => {
    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-2'));
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/10#1']);
  });

  it('counts from the start again for a new subscription', async () => {
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    // The stream starts over at the confirmed position and delivers the same change again.
    resetBuffers();
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/10#0']);
  });
});
