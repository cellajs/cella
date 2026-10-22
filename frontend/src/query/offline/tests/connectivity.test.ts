import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetOnline = vi.fn();

vi.mock('@tanstack/react-query', () => ({ onlineManager: { setOnline: mockSetOnline } }));

vi.mock('shared', () => ({ appConfig: { backendUrl: 'https://test.example.com' } }));

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

  it('takes the app offline only once every probe attempt fails, so a radio waking after resume is no outage', async () => {
    // A backgrounded mobile PWA: the first fetch fails while the radio wakes, the retry reaches the server.
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response);
    const { checkConnectivity, resetConnectivityCache } = await importModule();

    const recovering = checkConnectivity();
    await vi.runAllTimersAsync(); // flush retry delay
    expect(await recovering).toBe(true);
    expect(mockSetOnline).not.toHaveBeenCalled();

    // Every attempt fails, by a network error or an error response: queries and mutations pause.
    resetConnectivityCache();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    const failing = checkConnectivity();
    await vi.runAllTimersAsync(); // flush retry delays
    expect(await failing).toBe(false);
    expect(mockSetOnline).toHaveBeenCalledWith(false);
  });

  it('re-probes on a tab resume past a cached failure, and brings the app back online only once the server answers', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const { checkConnectivity, revalidateConnectivity } = await importModule();

    const offline = checkConnectivity(); // caches the failure
    await vi.runAllTimersAsync();
    expect(await offline).toBe(false);

    const stillOffline = revalidateConnectivity();
    await vi.runAllTimersAsync();
    expect(await stillOffline).toBe(false);
    expect(mockSetOnline).not.toHaveBeenCalledWith(true);

    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    expect(await revalidateConnectivity()).toBe(true);
    expect(mockSetOnline).toHaveBeenLastCalledWith(true);
  });
});
