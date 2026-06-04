import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetOnline = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  onlineManager: { setOnline: mockSetOnline },
}));

vi.mock('shared', () => ({
  appConfig: { backendUrl: 'https://test.example.com' },
}));

describe('connectivity probe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    mockSetOnline.mockClear();
    // Reset module state between tests so each starts clean
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function importModule() {
    return import('../connectivity');
  }

  // --- Cache TTL ---

  it('should return cached result within TTL window', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const { checkConnectivity } = await importModule();

    await checkConnectivity();
    await checkConnectivity();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should probe again after TTL expires', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const { checkConnectivity } = await importModule();

    await checkConnectivity();

    vi.advanceTimersByTime(10_001);
    await checkConnectivity();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should probe fresh after resetConnectivityCache', async () => {
    // First probe fails on every retry attempt; after reset the next probe succeeds.
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity, resetConnectivityCache } = await importModule();

    const firstPromise = checkConnectivity();
    await vi.runAllTimersAsync(); // flush retry delays
    expect(await firstPromise).toBe(false);

    resetConnectivityCache();
    const second = await checkConnectivity();
    expect(second).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4); // 3 failed attempts + 1 success
  });

  // --- Deduplication ---

  it('should deduplicate concurrent calls into a single probe', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const { checkConnectivity } = await importModule();

    const results = await Promise.all([checkConnectivity(), checkConnectivity(), checkConnectivity()]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, true, true]);
  });

  it('should clear inFlight on probe failure so subsequent calls are not stuck', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity, resetConnectivityCache } = await importModule();

    const failPromise = checkConnectivity(); // fails on all retries, should clear inFlight
    await vi.runAllTimersAsync(); // flush retry delays
    await failPromise;
    resetConnectivityCache(); // clear cached false so next call probes again
    const result = await checkConnectivity(); // should issue new probe

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4); // 3 failed attempts + 1 success
  });

  // --- onlineManager cascade ---

  it('should set onlineManager offline on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const { checkConnectivity } = await importModule();

    const promise = checkConnectivity();
    await vi.runAllTimersAsync(); // flush retry delays
    expect(await promise).toBe(false);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it('should set onlineManager offline on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    const { checkConnectivity } = await importModule();

    const promise = checkConnectivity();
    await vi.runAllTimersAsync(); // flush retry delays
    expect(await promise).toBe(false);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it('should not touch onlineManager when server is reachable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity } = await importModule();

    expect(await checkConnectivity()).toBe(true);
    expect(mockSetOnline).not.toHaveBeenCalled();
  });

  // --- Retry before offline (mobile resume) ---

  it('should recover without going offline when an early attempt fails then succeeds', async () => {
    // Simulates a backgrounded mobile PWA: first fetch fails while the radio wakes, then succeeds.
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity } = await importModule();

    const promise = checkConnectivity();
    await vi.runAllTimersAsync(); // flush retry delay
    expect(await promise).toBe(true);
    expect(mockSetOnline).not.toHaveBeenCalled(); // never flipped offline
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // --- Revalidate on resume ---

  it('should restore online state when revalidate finds the network is back', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const { revalidateConnectivity } = await importModule();

    expect(await revalidateConnectivity()).toBe(true);
    expect(mockSetOnline).toHaveBeenCalledWith(true);
  });

  it('should not restore online state when revalidate still finds offline', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const { revalidateConnectivity } = await importModule();

    const promise = revalidateConnectivity();
    await vi.runAllTimersAsync(); // flush retry delays
    expect(await promise).toBe(false);
    expect(mockSetOnline).not.toHaveBeenCalledWith(true);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it('should bypass the cache so a resume always re-probes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const { checkConnectivity, revalidateConnectivity } = await importModule();

    await checkConnectivity(); // primes the cache
    await revalidateConnectivity(); // must probe again despite fresh cache

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
