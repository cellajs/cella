import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDocContext, mockWebSocket, storageMock } from './helpers';

vi.mock('../data/storage', () => storageMock());
vi.mock('../sync/compaction', () => ({ compactDocument: vi.fn().mockResolvedValue('ok') }));

const { runStartupSweep } = await import('../sync/sweep');
const { listStaleDocs, deleteDoc } = await import('../data/storage');
const { compactDocument } = await import('../sync/compaction');
const { joinCollab } = await import('../sync/session-manager');

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

describe('runStartupSweep', () => {
  it('compacts every orphaned session through the shared routine, then deletes its rows', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([
      staleRow(),
      staleRow({ entityId: 'entity-2', organizationId: null }),
    ]);

    await runStartupSweep();

    expect(compactDocument).toHaveBeenCalledTimes(2);
    expect(compactDocument).toHaveBeenCalledWith({ ...staleRow(), userId: '', verified: true });
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(deleteDoc).toHaveBeenCalledWith({
      ...staleRow({ entityId: 'entity-2', organizationId: null }),
      userId: '',
      verified: true,
    });
  });

  it('deletes a row with nothing logged without a write (empty compaction)', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow()]);
    vi.mocked(compactDocument).mockResolvedValueOnce('empty');
    await runStartupSweep();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('keeps the rows when materialization is retry-class or compaction throws', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow(), staleRow({ entityId: 'entity-2' })]);
    vi.mocked(compactDocument).mockResolvedValueOnce('retry').mockRejectedValueOnce(new Error('db down'));
    await runStartupSweep();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('skips a document that has a live session in this process', async () => {
    const live = mockDocContext({ entityId: 'entity-live', verified: true });
    joinCollab(live, mockWebSocket() as never);
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow({ entityId: 'entity-live' })]);
    await runStartupSweep();
    expect(compactDocument).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('a listing failure is logged and the sweep returns', async () => {
    vi.mocked(listStaleDocs).mockRejectedValueOnce(new Error('db down'));
    await expect(runStartupSweep()).resolves.toBeUndefined();
    expect(compactDocument).not.toHaveBeenCalled();
  });
});
