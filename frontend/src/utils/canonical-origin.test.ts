import { describe, expect, it } from 'vitest';
import { canonicalOriginUrl } from './canonical-origin';

const at = (href: string) => {
  const { origin, pathname, search, hash } = new URL(href);
  return { origin, pathname, search, hash };
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

  it.each(['development', 'tunnel', 'test'] as const)('leaves %s builds on any host', (mode) => {
    expect(canonicalOriginUrl(at('http://192.168.1.20:3000/'), 'http://localhost:3000', mode)).toBeNull();
  });
});
