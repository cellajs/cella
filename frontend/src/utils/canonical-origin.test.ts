import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalOriginUrl, leaveForCanonicalOrigin } from '~/utils/canonical-origin';

const at = (href: string) => {
  const { origin, hostname, pathname, search, hash } = new URL(href);
  return { origin, hostname, pathname, search, hash };
};

describe('canonicalOriginUrl', () => {
  it('keeps a page on the frontend origin', () => {
    expect(canonicalOriginUrl(at('https://www.example.com/about?a=1'), 'https://www.example.com', 'production')).toBeNull();
  });

  it('sends a bare apex to the frontend origin with path, search and hash', () => {
    expect(canonicalOriginUrl(at('https://example.com/acme/tasks?q=x#top'), 'https://www.example.com', 'production')).toBe(
      'https://www.example.com/acme/tasks?q=x#top',
    );
  });

  it('sends another host in staging', () => {
    expect(canonicalOriginUrl(at('https://old.example.com/'), 'https://staging.example.com', 'staging')).toBe('https://staging.example.com/');
  });

  it('treats a scheme or port difference as another origin', () => {
    expect(canonicalOriginUrl(at('http://www.example.com/'), 'https://www.example.com', 'production')).toBe('https://www.example.com/');
    expect(canonicalOriginUrl(at('https://www.example.com:8443/'), 'https://www.example.com', 'production')).toBe('https://www.example.com/');
  });

  it.each(['http://localhost:4173/', 'http://127.0.0.1:4173/', 'http://[::1]:4173/'])('leaves a local preview on %s', (href) => {
    expect(canonicalOriginUrl(at(href), 'https://www.example.com', 'production')).toBeNull();
  });

  it.each(['development', 'tunnel', 'test'] as const)('leaves %s builds on any host', (mode) => {
    expect(canonicalOriginUrl(at('http://192.168.1.20:3000/'), 'http://localhost:3000', mode)).toBeNull();
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

  it('leaves when the cleanup fails', async () => {
    const { replace } = stubBrowser(async () => {
      throw new Error('storage blocked');
    });

    await leaveForCanonicalOrigin(url);

    expect(replace).toHaveBeenCalledWith(url);
  });

  it('leaves after the timeout when the cleanup stalls', async () => {
    vi.useFakeTimers();
    const { replace } = stubBrowser(() => new Promise(() => {}));

    const leaving = leaveForCanonicalOrigin(url, 2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(replace).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await leaving;

    expect(replace).toHaveBeenCalledWith(url);
  });
});
