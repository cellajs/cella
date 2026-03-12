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
    return import('~/lib/connectivity');
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
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity, resetConnectivityCache } = await importModule();

    const first = await checkConnectivity();
    expect(first).toBe(false);

    resetConnectivityCache();
    const second = await checkConnectivity();
    expect(second).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity, resetConnectivityCache } = await importModule();

    await checkConnectivity(); // fails, should clear inFlight
    resetConnectivityCache(); // clear cached false so next call probes again
    const result = await checkConnectivity(); // should issue new probe

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // --- onlineManager cascade ---

  it('should set onlineManager offline on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { checkConnectivity } = await importModule();

    expect(await checkConnectivity()).toBe(false);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it('should set onlineManager offline on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const { checkConnectivity } = await importModule();

    expect(await checkConnectivity()).toBe(false);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it('should not touch onlineManager when server is reachable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity } = await importModule();

    expect(await checkConnectivity()).toBe(true);
    expect(mockSetOnline).not.toHaveBeenCalled();
  });
});
