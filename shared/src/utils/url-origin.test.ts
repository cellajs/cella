import { describe, expect, it } from 'vitest';
import { isOriginIn } from './url-origin.ts';

const cdn = 'https://files.example.test';

describe('isOriginIn', () => {
  it('accepts a URL on an allowed origin (positive control)', () => {
    expect(isOriginIn(`${cdn}/avatars/a.png`, [cdn])).toBe(true);
    expect(isOriginIn(`${cdn}/`, ['https://other.example.test', cdn])).toBe(true);
    expect(isOriginIn('https://FILES.example.test/a.png', [cdn])).toBe(true);
  });

  it('must not trust another host via a userinfo prefix', () => {
    expect(isOriginIn(`${cdn}@evil.example/a.png`, [cdn])).toBe(false);
    expect(isOriginIn(`${cdn}:pass@evil.example/a.png`, [cdn])).toBe(false);
  });

  it('must not trust an allowed host that carries userinfo', () => {
    expect(isOriginIn('https://user@files.example.test/a.png', [cdn])).toBe(false);
    expect(isOriginIn('https://user:pass@files.example.test/a.png', [cdn])).toBe(false);
  });

  it('must not trust another host via a subdomain or a shared prefix', () => {
    expect(isOriginIn(`${cdn}.evil.example/a.png`, [cdn])).toBe(false);
    expect(isOriginIn(`${cdn}evil.example/a.png`, [cdn])).toBe(false);
  });

  it('must not trust another port or scheme on the allowed host', () => {
    expect(isOriginIn(`${cdn}:8443/a.png`, [cdn])).toBe(false);
    expect(isOriginIn('http://files.example.test/a.png', [cdn])).toBe(false);
    expect(isOriginIn('ftp://files.example.test/a.png', [cdn])).toBe(false);
  });

  it('accepts http only for an allowed origin that is itself http', () => {
    expect(isOriginIn('http://localhost:3000/a.png', ['http://localhost:3000'])).toBe(true);
    expect(isOriginIn('https://localhost:3000/a.png', ['http://localhost:3000'])).toBe(false);
  });

  it('refuses unparseable, relative and non-http input', () => {
    expect(isOriginIn('', [cdn])).toBe(false);
    expect(isOriginIn('/a.png', [cdn])).toBe(false);
    expect(isOriginIn('//files.example.test/a.png', [cdn])).toBe(false);
    expect(isOriginIn('javascript:alert(1)', [cdn])).toBe(false);
    // Opaque origins serialize as "null" on both sides; they never count as a match.
    expect(isOriginIn('data:text/html,x', ['data:text/html,y'])).toBe(false);
    expect(isOriginIn('custom://files/a.png', ['custom://files'])).toBe(false);
  });

  it('skips allowed origins that do not parse', () => {
    expect(isOriginIn(`${cdn}/a.png`, ['', 'not a url'])).toBe(false);
    expect(isOriginIn(`${cdn}/a.png`, ['not a url', cdn])).toBe(true);
  });
});
