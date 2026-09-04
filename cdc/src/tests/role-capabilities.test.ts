import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();
vi.mock('../lib/db', () => ({ cdcDb: { execute: (...args: unknown[]) => execute(...args) } }));

const { getRoleCapabilities, probeRoleCapabilities, resetRoleCapabilities } = await import(
  '../services/role-capabilities'
);
const { log } = await import('../lib/pino');

const row = (overrides: Record<string, unknown> = {}) => ({
  role: 'admin_role',
  superuser: false,
  bypass_rls: false,
  replication: true,
  rls_blocked_tables: [],
  ...overrides,
});

describe('probeRoleCapabilities', () => {
  beforeEach(() => {
    resetRoleCapabilities();
    execute.mockReset();
    vi.mocked(log.error).mockClear();
  });

  it('accepts an owner without BYPASSRLS when no RLS table is forced or foreign-owned (the managed-provider shape)', async () => {
    execute.mockResolvedValue({ rows: [row()] });

    await expect(probeRoleCapabilities()).resolves.toEqual({
      role: 'admin_role',
      rlsBypass: true,
      rlsBlockedTables: [],
      replication: true,
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs an error and lists the tables when a forced or foreign-owned RLS table blocks the role', async () => {
    execute.mockResolvedValue({ rows: [row({ rls_blocked_tables: ['attachments', 'yjs_documents'] })] });

    await probeRoleCapabilities();

    expect(getRoleCapabilities()).toEqual({
      role: 'admin_role',
      rlsBypass: false,
      rlsBlockedTables: ['attachments', 'yjs_documents'],
      replication: true,
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('logs an error when the role lacks REPLICATION', async () => {
    execute.mockResolvedValue({ rows: [row({ replication: false })] });

    await probeRoleCapabilities();

    expect(getRoleCapabilities()?.replication).toBe(false);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('lets the BYPASSRLS attribute override blocked tables', async () => {
    execute.mockResolvedValue({ rows: [row({ bypass_rls: true, rls_blocked_tables: ['attachments'] })] });

    await expect(probeRoleCapabilities()).resolves.toMatchObject({ rlsBypass: true, rlsBlockedTables: [] });
  });

  it('counts a superuser as having both capabilities implicitly', async () => {
    execute.mockResolvedValue({
      rows: [row({ role: 'postgres', superuser: true, replication: false, rls_blocked_tables: ['attachments'] })],
    });

    await expect(probeRoleCapabilities()).resolves.toEqual({
      role: 'postgres',
      rlsBypass: true,
      rlsBlockedTables: [],
      replication: true,
    });
  });

  it('leaves the capabilities unknown when the probe fails', async () => {
    execute.mockRejectedValue(new Error('permission denied'));

    await expect(probeRoleCapabilities()).resolves.toBeNull();
    expect(getRoleCapabilities()).toBeNull();
  });
});
