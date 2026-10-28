import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { backendUrl: 'https://test.example.com' } }));

const unreachable = new TypeError('Failed to fetch');
const answered = new Response(null, { status: 204 });

describe('connectivity', () => {
  const page = { hidden: false, onVisibilityChange: () => {} };

  beforeEach(() => {
    vi.useFakeTimers();
    // A fresh onlineManager and module state per test.
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('navigator', { onLine: true });
    page.hidden = false;
    vi.stubGlobal('document', {
      get hidden() {
        return page.hidden;
      },
      addEventListener: (_type: string, listener: () => void) => {
        page.onVisibilityChange = listener;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function load() {
    const { onlineManager } = await import('@tanstack/react-query');
    return { onlineManager, ...(await import('~/query/offline/connectivity')) };
  }

  it('takes the app offline only once every probe attempt fails, so a radio waking after resume is no outage', async () => {
    // A backgrounded mobile PWA: the first fetch fails while the radio wakes, the retry reaches the server.
    vi.mocked(fetch).mockRejectedValueOnce(unreachable).mockResolvedValueOnce(answered);
    const { onlineManager, reportNetworkFailure } = await load();

    const recovering = reportNetworkFailure();
    await vi.runAllTimersAsync();
    await recovering;
    expect(onlineManager.isOnline()).toBe(true);

    // Every attempt fails, by a network error or an error response: queries and mutations pause.
    vi.mocked(fetch)
      .mockRejectedValueOnce(unreachable)
      .mockResolvedValue(new Response(null, { status: 503 }));
    const failing = reportNetworkFailure();
    await vi.runAllTimersAsync();
    await failing;
    expect(onlineManager.isOnline()).toBe(false);
  });

  // Recovery needs no alert: an outage that ends within the alert's delay never shows it, and a dismissed alert leaves the re-checks running.
  it('re-checks until the API answers however long the outage lasts, pauses in a hidden tab and re-checks at once on resume', async () => {
    vi.mocked(fetch).mockRejectedValue(unreachable);
    const { onlineManager, reportNetworkFailure, startConnectivity } = await load();
    const stop = startConnectivity();

    const failing = reportNetworkFailure();
    await vi.advanceTimersByTimeAsync(2000);
    await failing;
    expect(onlineManager.isOnline()).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onlineManager.isOnline()).toBe(false);

    vi.mocked(fetch).mockResolvedValue(answered);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onlineManager.isOnline()).toBe(true);

    // Offline again, then hidden: no probe runs until the tab is visible.
    onlineManager.setOnline(false);
    page.hidden = true;
    page.onVisibilityChange();
    vi.mocked(fetch).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).not.toHaveBeenCalled();

    page.hidden = false;
    page.onVisibilityChange();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onlineManager.isOnline()).toBe(true);

    stop();
  });
});
