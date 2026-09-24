import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLockS3 } from '../../tests/helpers/fake-lock-s3';
import type { LockInfo } from './control-store';
import { acquireLease, installSignalRelease } from './stack-lease';

const T0 = 1_000_000;

describe('acquireLease', () => {
  beforeEach(() => vi.useFakeTimers({ now: T0 }));
  afterEach(() => vi.useRealTimers());

  it('acquires a free lock and renews it on the cadence', async () => {
    const { s3, currentInfo } = makeLockS3();
    const res = await acquireLease({
      s3,
      bucket: 'b',
      key: 'k',
      owner: 'operator:a',
      operation: 'apply',
      ttlMs: 60_000,
      renewEveryMs: 10_000,
      now: () => Date.now(),
    });
    expect(res.acquired).toBe(true);
    if (!res.acquired) return;
    expect(currentInfo()?.expiresAt).toBe(new Date(T0 + 60_000).toISOString());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(currentInfo()?.expiresAt).toBe(new Date(T0 + 10_000 + 60_000).toISOString());
    expect(res.lease.lost).toBe(false);
    await res.lease.release();
    expect(currentInfo()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(currentInfo()).toBeUndefined();
  });

  it('waits for a live lock to lapse, then takes it', async () => {
    const held: LockInfo = {
      owner: 'operator:b',
      operation: 'deploy',
      acquiredAt: '',
      expiresAt: new Date(T0 + 15_000).toISOString(),
    };
    const { s3, currentInfo } = makeLockS3(held);
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    };
    const res = await acquireLease({
      s3,
      bucket: 'b',
      key: 'k',
      owner: 'operator:a',
      operation: 'apply',
      ttlMs: 60_000,
      waitMs: 60_000,
      pollMs: 10_000,
      now: () => Date.now(),
      sleep,
      onWait: (_held, remaining) => waits.push(remaining),
    });
    expect(res.acquired).toBe(true);
    expect(currentInfo()?.owner).toBe('operator:a');
    expect(waits.length).toBe(2);
    if (res.acquired) await res.lease.release();
  });

  it('gives up after waitMs when the holder keeps its lease', async () => {
    const held: LockInfo = {
      owner: 'ci:run-9',
      operation: 'deploy',
      acquiredAt: '',
      expiresAt: new Date(T0 + 3_600_000).toISOString(),
    };
    const { s3 } = makeLockS3(held);
    const sleep = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    };
    const res = await acquireLease({
      s3,
      bucket: 'b',
      key: 'k',
      owner: 'operator:a',
      operation: 'apply',
      waitMs: 25_000,
      pollMs: 10_000,
      now: () => Date.now(),
      sleep,
    });
    expect(res.acquired).toBe(false);
    if (!res.acquired) expect(res.held.owner).toBe('ci:run-9');
  });

  it('marks the lease lost when a renewal finds another owner, and then never deletes their lock', async () => {
    const { s3, currentInfo, overwrite } = makeLockS3();
    const reasons: string[] = [];
    const res = await acquireLease({
      s3,
      bucket: 'b',
      key: 'k',
      owner: 'operator:a',
      operation: 'apply',
      ttlMs: 60_000,
      renewEveryMs: 10_000,
      now: () => Date.now(),
      onRenewFailed: (reason) => reasons.push(reason),
    });
    if (!res.acquired) throw new Error('expected acquire');
    overwrite({
      owner: 'operator:b',
      operation: 'apply',
      acquiredAt: '',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(res.lease.lost).toBe(true);
    expect(reasons[0]).toMatch(/held by operator:b/);
    await res.lease.release();
    expect(currentInfo()?.owner).toBe('operator:b');
  });
});

describe('installSignalRelease', () => {
  it('releases and exits 130 on SIGINT, and uninstalls cleanly', async () => {
    const released: string[] = [];
    const lease = { info: {} as LockInfo, lost: false, release: async () => void released.push('released') };
    const exits: number[] = [];
    const uninstall = installSignalRelease(lease, { exit: (code) => void exits.push(code) });
    process.emit('SIGINT');
    await new Promise((resolve) => setImmediate(resolve));
    expect(released).toEqual(['released']);
    expect(exits).toEqual([130]);
    uninstall();
    expect(process.listenerCount('SIGTERM')).toBe(0);
  });
});
