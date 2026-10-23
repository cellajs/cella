import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalOriginUrl, leaveForCanonicalOrigin } from '~/utils/canonical-origin';

const at = (href: string) => {
  const { origin, hostname, pathname, search, hash } = new URL(href);
  return { origin, hostname, pathname, search, hash };
};

describe('canonicalOriginUrl', () => {
  it('sends a bare apex to the frontend origin with path, search and hash', () => {
    expect(canonicalOriginUrl(at('https://example.com/acme/tasks?q=x#top'), 'https://www.example.com', 'production')).toBe(
      'https://www.example.com/acme/tasks?q=x#top',
    );
  });

  it.each(['http://localhost:4173/', 'http://127.0.0.1:4173/', 'http://[::1]:4173/'])('leaves a local preview on %s', (href) => {
    expect(canonicalOriginUrl(at(href), 'https://www.example.com', 'production')).toBeNull();
  });
});

describe('leaveForCanonicalOrigin', () => {
  const url = 'https://www.example.com/acme';

  const stubBrowser = (getRegistrations: () => Promise<{ unregister: () => Promise<boolean> }[]>) => {
    const replace = vi.fn();
    const deleteCache = vi.fn(async (_name: string) => true);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } });
    vi.stubGlobal('caches', { keys: async () => ['precache', 'grammars'], delete: deleteCache });
    vi.stubGlobal('window', { location: { replace } });
    return { replace, deleteCache };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('unregisters every worker and deletes every cache before it leaves', async () => {
    const unregister = vi.fn(async () => true);
    const { replace, deleteCache } = stubBrowser(async () => [{ unregister }, { unregister }]);

    await leaveForCanonicalOrigin(url);

    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual(['precache', 'grammars']);
    expect(replace).toHaveBeenCalledWith(url);
  });

  it('leaves whatever the cleanup does: when it fails, and at the timeout when it stalls', async () => {
    const failing = stubBrowser(async () => {
      throw new Error('storage blocked');
    });
    await leaveForCanonicalOrigin(url);
    expect(failing.replace).toHaveBeenCalledWith(url);

    vi.useFakeTimers();
    const stalled = stubBrowser(() => new Promise(() => {}));
    const leaving = leaveForCanonicalOrigin(url, 2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(stalled.replace).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await leaving;
    expect(stalled.replace).toHaveBeenCalledWith(url);
  });
});
