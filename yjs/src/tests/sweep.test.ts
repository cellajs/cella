import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageMock } from './helpers';

vi.mock('../data/storage', () => storageMock());

vi.mock('../sync/materialize', () => ({
  materializeState: vi.fn().mockResolvedValue('ok'),
  postMaterialize: vi.fn().mockResolvedValue('ok'),
  stateToBlocksJson: vi.fn(() => '[{"type":"paragraph"}]'),
}));

const { runStartupSweep } = await import('../sync/sweep');
const { listStaleDocs, deleteStaleDoc } = await import('../data/storage');
const { postMaterialize } = await import('../sync/materialize');

const staleRow = (overrides: Record<string, unknown> = {}) => ({
  entityType: 'task',
  entityId: 'entity-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  state: new Uint8Array([1, 2, 3]),
  lastEditedBy: 'user-1',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runStartupSweep', () => {
  it('materializes edited orphan rows on behalf of the last editor, then deletes them', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow()]);

    await runStartupSweep();

    expect(postMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'task', entityId: 'entity-1', tenantId: 'tenant-1' }),
      'user-1',
      '[{"type":"paragraph"}]',
    );
    expect(deleteStaleDoc).toHaveBeenCalledWith('task', 'entity-1');
  });

  it('deletes seed-only rows (no lastEditedBy) without materializing', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow({ lastEditedBy: null })]);

    await runStartupSweep();

    expect(postMaterialize).not.toHaveBeenCalled();
    expect(deleteStaleDoc).toHaveBeenCalledWith('task', 'entity-1');
  });

  it('keeps the row when materialization is retry-class (backend down)', async () => {
    vi.mocked(listStaleDocs).mockResolvedValueOnce([staleRow()]);
    vi.mocked(postMaterialize).mockResolvedValueOnce('retry');

    await runStartupSweep();

    expect(deleteStaleDoc).not.toHaveBeenCalled();
  });
});
