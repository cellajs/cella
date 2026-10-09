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

import { handleDataMessage, resetBuffers } from '../pipeline/handle-message';
import { fence } from '../services/fence';
import { replicationState } from '../services/replication-state';
import { dmlMessage } from './factories';

const { parseMessage } = await import('../pipeline/parse-message');
const mocked = vi.mocked(parseMessage);
const { processFlush } = await import('../pipeline/process-events');

const mockDmlMessage = (tag: 'insert' | 'update' | 'delete', id: string) => dmlMessage(tag, 'tasks', { id });

const begin = (commitLsn: string) => handleDataMessage(commitLsn, { tag: 'begin', xid: 7, commitLsn, commitTime: BigInt(0) });
const commit = (lsn: string) => handleDataMessage(lsn, { tag: 'commit' } as never);

/** A service that takes every acknowledgement, as an open subscription does. */
const serviceWith = (acknowledge = vi.fn(async () => true)) => {
  const stop = vi.fn(async () => {});
  replicationState.service = { acknowledge, stop } as unknown as typeof replicationState.service;
  return { acknowledge, stop };
};

beforeEach(async () => {
  replicationState.reset();
  await resetBuffers();
  vi.clearAllMocks();
});

describe('handleDataMessage: a worker that is behind', () => {
  it('measures how far it is behind from the commit time of the transaction it reads', async () => {
    // As the replication client reports it: microseconds since the Unix epoch.
    const commitTime = BigInt(Date.now() - 15_000) * 1000n;

    await handleDataMessage('0/1', { tag: 'begin', xid: 7, commitLsn: '0/9', commitTime });

    expect(replicationState.lagMs).toBeGreaterThanOrEqual(15_000);
    expect(replicationState.lagMs).toBeLessThan(20_000);
  });
});

describe('handleDataMessage: a change the parser drops', () => {
  it('acknowledges nothing for it: the idle acknowledgement moves the slot past it', async () => {
    const { acknowledge } = serviceWith();

    await begin('0/90');
    mocked.mockReturnValueOnce(null);
    await handleDataMessage('0/7', mockDmlMessage('insert', 'usr-1'));

    // A position inside a source transaction acknowledges nothing a slot can use.
    expect(acknowledge).not.toHaveBeenCalled();
    expect(replicationState.lastAckedLsn).toBeNull();
    expect(processFlush).not.toHaveBeenCalled();
  });
});

describe('handleDataMessage: what a flush acknowledges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acknowledges the commit position of the last source transaction of a flush', async () => {
    const { acknowledge } = serviceWith();

    await begin('0/90');
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await commit('0/98');
    await begin('0/A0');
    await handleDataMessage('0/20', mockDmlMessage('insert', 'usr-2'));
    await commit('0/A8');
    await vi.runAllTimersAsync();

    // One flush of two source transactions. 0/20, its last change, lies before the second commit.
    expect(processFlush).toHaveBeenCalledOnce();
    expect(acknowledge.mock.calls).toEqual([['0/A0']]);
    expect(replicationState.lastAckedLsn).toBe('0/A0');
  });

  it('must not move the acknowledged position backwards from one flush to the next', async () => {
    const { acknowledge } = serviceWith();

    // A long transaction wrote first and committed last: its changes lie before the commit of the short one.
    await begin('0/90');
    await handleDataMessage('0/50', mockDmlMessage('insert', 'usr-1'));
    await commit('0/98');
    await vi.runAllTimersAsync();
    await begin('0/200');
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-2'));
    await commit('0/208');
    await vi.runAllTimersAsync();

    // By the positions of the changes the second acknowledgement would be 0/10, behind the first.
    expect(acknowledge.mock.calls).toEqual([['0/90'], ['0/200']]);
  });

  it('forgets the failure it was reading again from once a flush is recorded', async () => {
    serviceWith();
    replicationState.recordFailure('0/10', new Error('refused'));

    await begin('0/90');
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await commit('0/98');
    await vi.runAllTimersAsync();

    expect(replicationState.failure).toBeNull();
  });
});

describe("handleDataMessage: a change's place in its transaction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Every change handed to a flush, as its transaction's commit position and its index there. */
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
    // The stream starts over at the acknowledged position and delivers the same transaction again.
    await resetBuffers();
    await begin('0/90');
    await handleDataMessage('0/10', mockDmlMessage('insert', 'usr-1'));
    await commit('0/90');
    await vi.runAllTimersAsync();

    expect(flushed()).toEqual(['0/90#0']);
  });
});

describe('handleDataMessage: the marker of a recount', () => {
  const marker = (content: string) =>
    handleDataMessage('0/C0', { tag: 'message', prefix: 'sync-fence', content: new TextEncoder().encode(content) } as never);

  afterEach(() => {
    fence.close();
  });

  it('flushes what came before it, then tells the fence the stream has passed', async () => {
    serviceWith();
    fence.open('verify', '100:100:', 'marker-1');
    let passed = false;
    void fence.whenPassed().then((streamPassed) => {
      passed = streamPassed;
    });

    // A change outside a transaction goes straight to the flush buffer, where it waits for the window to end.
    await handleDataMessage('0/B0', mockDmlMessage('update', 'usr-1'));
    await marker('marker-1');
    await Promise.resolve();

    expect(processFlush).toHaveBeenCalledOnce();
    expect(passed).toBe(true);
  });

  it('must not tell the fence when the subscription ended while it flushed: what was pending is read again', async () => {
    serviceWith();
    fence.open('verify', '100:100:', 'marker-1');
    let passed = false;
    void fence.whenPassed().then((streamPassed) => {
      passed = streamPassed;
    });
    let release: () => void = () => {};
    vi.mocked(processFlush).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    await handleDataMessage('0/B0', mockDmlMessage('update', 'usr-1'));
    const handled = marker('marker-1');
    // The loop starts the next subscription: the flush in flight is waited for.
    const reset = resetBuffers();
    release();
    await Promise.all([handled, reset]);
    await Promise.resolve();

    expect(passed).toBe(false);
  });
});

describe('handleDataMessage: a message it cannot handle', () => {
  it('fails the subscription at that position: the stream is read again, nothing is dropped', async () => {
    const { stop } = serviceWith();
    mocked.mockImplementationOnce(() => {
      throw new Error('column "payload" has a value the parser cannot read');
    });

    await handleDataMessage('0/30', mockDmlMessage('insert', 'usr-1'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(replicationState.failure).toMatchObject({ position: '0/30', count: 1, passing: false });
  });

  it('must not acknowledge a later position after the failure, for a flush of what the service still delivers', async () => {
    vi.useFakeTimers();
    try {
      const { acknowledge } = serviceWith();
      mocked.mockImplementationOnce(() => {
        throw new Error('unreadable');
      });
      await handleDataMessage('0/30', mockDmlMessage('insert', 'usr-1'));

      // The service is still delivering what it had queued: none of it is taken, flushed or acknowledged.
      await begin('0/90');
      await handleDataMessage('0/40', mockDmlMessage('insert', 'usr-2'));
      await commit('0/98');
      await vi.runAllTimersAsync();

      expect(processFlush).not.toHaveBeenCalled();
      expect(acknowledge).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
