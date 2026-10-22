// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warning = vi.hoisted(() => vi.fn());
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { warning } }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

const mb = 1024 * 1024;

/** A fresh module: its once-per-session flag starts unset, as on a page load. */
const load = async () => {
  vi.resetModules();
  return import('~/modules/common/blocknote/storage-warning');
};

const estimateReturns = (estimate: StorageEstimate) => vi.stubGlobal('navigator', { storage: { estimate: async () => estimate } });

beforeEach(() => {
  warning.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage pressure', () => {
  it('runs low under 100 MB free or past 90% of the quota, and not at either boundary', async () => {
    const { isStorageLow } = await load();

    expect(isStorageLow({ usage: 900 * mb, quota: 1000 * mb })).toBe(false);
    expect(isStorageLow({ usage: 900 * mb + 1, quota: 1000 * mb })).toBe(true);
    expect(isStorageLow({ usage: 9_950 * mb, quota: 10_000 * mb })).toBe(true);
    expect(isStorageLow({ usage: 5_000 * mb, quota: 10_000 * mb })).toBe(false);
    // A small quota with 50 MB free runs low on the ratio.
    expect(isStorageLow({ usage: 450 * mb, quota: 500 * mb })).toBe(true);
    // Unknown sizes are not low.
    expect(isStorageLow({})).toBe(false);
    expect(isStorageLow({ usage: 10, quota: 0 })).toBe(false);
  });

  it('warns once per session when the device runs low, also across the eviction each boot runs', async () => {
    estimateReturns({ usage: 9_950 * mb, quota: 10_000 * mb });
    let { warnOnStoragePressure } = await load();

    await warnOnStoragePressure();
    await warnOnStoragePressure();
    expect(warning).toHaveBeenCalledExactlyOnceWith('c:storage_low.text', { id: 'storage-low' });

    // A reload in the same tab session.
    ({ warnOnStoragePressure } = await load());
    await warnOnStoragePressure();
    expect(warning).toHaveBeenCalledOnce();
  });

  it('warns when the stored documents reached their limits with nothing left to evict, whatever the device has free', async () => {
    estimateReturns({ usage: 1 * mb, quota: 10_000 * mb });
    const { warnOnStoragePressure } = await load();

    await warnOnStoragePressure();
    expect(warning).not.toHaveBeenCalled();

    await warnOnStoragePressure({ limitsReached: true });
    expect(warning).toHaveBeenCalledOnce();
  });

  it('stays quiet where the browser has no estimate', async () => {
    vi.stubGlobal('navigator', {});
    const { warnOnStoragePressure } = await load();

    await warnOnStoragePressure();
    expect(warning).not.toHaveBeenCalled();
  });
});
