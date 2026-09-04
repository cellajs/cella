import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();
vi.mock('../lib/db', () => ({ cdcDb: { execute: (...args: unknown[]) => execute(...args) } }));

const { getRoleCapabilities, probeRoleCapabilities, resetRoleCapabilities } = await import(
  '../services/role-capabilities'
);
const { log } = await import('../lib/pino');

describe('probeRoleCapabilities', () => {
  beforeEach(() => {
    resetRoleCapabilities();
    execute.mockReset();
    vi.mocked(log.error).mockClear();
  });

  it('reads the role flags and stays quiet when both attributes are present', async () => {
    execute.mockResolvedValue({
      rows: [{ role: 'admin_role', superuser: false, bypass_rls: true, replication: true }],
    });

    await expect(probeRoleCapabilities()).resolves.toEqual({ role: 'admin_role', bypassRls: true, replication: true });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs an error when a managed provider created the role without the attributes', async () => {
    execute.mockResolvedValue({
      rows: [{ role: 'admin_role', superuser: false, bypass_rls: false, replication: true }],
    });

    await probeRoleCapabilities();

    expect(getRoleCapabilities()).toEqual({ role: 'admin_role', bypassRls: false, replication: true });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('counts a superuser as having both attributes implicitly', async () => {
    execute.mockResolvedValue({ rows: [{ role: 'postgres', superuser: true, bypass_rls: false, replication: false }] });

    await expect(probeRoleCapabilities()).resolves.toEqual({ role: 'postgres', bypassRls: true, replication: true });
  });

  it('leaves the capabilities unknown when the probe fails', async () => {
    execute.mockRejectedValue(new Error('permission denied'));

    await expect(probeRoleCapabilities()).resolves.toBeNull();
    expect(getRoleCapabilities()).toBeNull();
  });
});
