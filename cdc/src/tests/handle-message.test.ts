import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies before importing the module under test
vi.mock('../pipeline/process-events', () => ({
  processEvents: vi.fn(),
}));

vi.mock('../services/catchup-recovery', () => ({
  runPostCatchupRecovery: vi.fn(),
}));

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
  wsClient: {
    isConnected: vi.fn(() => true),
    connect: vi.fn(),
    send: vi.fn(() => true),
    setCallbacks: vi.fn(),
  },
}));

import { replicationState } from '../services/replication-state';
import { handleDataMessage } from '../pipeline/handle-message';
import type { Pgoutput } from 'pg-logical-replication';

const { parseMessage } = await import('../pipeline/parse-message');
const mocked = vi.mocked(parseMessage);

/** Create a minimal DML message for testing */
function mockDmlMessage(tag: 'insert' | 'update' | 'delete', id: string): Pgoutput.Message {
  const row = { id };
  if (tag === 'delete') {
    return { tag, relation: { name: 'tasks' }, old: row } as unknown as Pgoutput.Message;
  }
  return { tag, relation: { name: 'tasks' }, new: row } as unknown as Pgoutput.Message;
}

describe('handleDataMessage — seeded entity filtering', () => {
  beforeEach(() => {
    replicationState.reset();
    vi.clearAllMocks();
  });

  it('processes updates to gen- prefixed entities (not skipped)', async () => {
    const msg = mockDmlMessage('update', 'gen-abc123');
    await handleDataMessage('0/1', msg);
    expect(mocked).toHaveBeenCalled();
  });

  it('processes deletes of gen- prefixed entities (not skipped)', async () => {
    const msg = mockDmlMessage('delete', 'gen-abc123');
    await handleDataMessage('0/1', msg);
    expect(mocked).toHaveBeenCalled();
  });

  it('processes inserts of gen- prefixed entities when NOT catching up', async () => {
    const msg = mockDmlMessage('insert', 'gen-abc123');
    await handleDataMessage('0/1', msg);
    expect(mocked).toHaveBeenCalled();
  });

  it('skips inserts of gen- prefixed entities during catch-up', async () => {
    // Enter catchup mode
    replicationState.updateLag(15_000);
    expect(replicationState.catchingUp).toBe(true);

    const msg = mockDmlMessage('insert', 'gen-abc123');
    await handleDataMessage('0/1', msg);
    expect(mocked).not.toHaveBeenCalled();
  });

  it('skips inserts of UUID-prefixed seeded entities during catch-up', async () => {
    replicationState.updateLag(15_000);
    expect(replicationState.catchingUp).toBe(true);

    const msg = mockDmlMessage('insert', '00000000-1234-4abc-8def-123456789abc');
    await handleDataMessage('0/1', msg);
    expect(mocked).not.toHaveBeenCalled();
  });

  it('processes inserts of non-gen entities during catch-up', async () => {
    replicationState.updateLag(15_000);
    expect(replicationState.catchingUp).toBe(true);

    const msg = mockDmlMessage('insert', 'usr-xyz789');
    await handleDataMessage('0/1', msg);
    expect(mocked).toHaveBeenCalled();
  });

  it('processes updates to gen- prefixed entities during catch-up', async () => {
    replicationState.updateLag(15_000);
    expect(replicationState.catchingUp).toBe(true);

    const msg = mockDmlMessage('update', 'gen-abc123');
    await handleDataMessage('0/1', msg);
    expect(mocked).toHaveBeenCalled();
  });
});
