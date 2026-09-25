import { describe, expect, it } from 'vitest';
import { toSafeRedirectPath } from './safe-redirect-path.ts';

const origin = 'https://app.example.test';
const safe = (input: unknown, opts: { maxLength?: number; denyPrefixes?: string[] } = {}) =>
  toSafeRedirectPath(input, { origin, ...opts });

describe('toSafeRedirectPath', () => {
  describe('legitimate paths (positive controls)', () => {
    it('keeps a plain path, its query and its hash', () => {
      expect(safe('/home')).toBe('/home');
      expect(safe('/home?tab=members#top')).toBe('/home?tab=members#top');
      expect(safe('/acme/organization/members?q=jane&sort=name#row-2')).toBe(
        '/acme/organization/members?q=jane&sort=name#row-2',
      );
    });

    it('keeps an encoded query intact', () => {
      expect(safe('/search?q=a%26b&tag=c%3Dd')).toBe('/search?q=a%26b&tag=c%3Dd');
      expect(safe('/auth/consent?uid=abc123')).toBe('/auth/consent?uid=abc123');
    });

    it('normalizes dot segments that stay on the origin', () => {
      expect(safe('/../etc')).toBe('/etc');
      expect(safe('/a/./b/../c')).toBe('/a/c');
    });

    it('returns a value that validates to itself', () => {
      for (const input of ['/home', '/a b', '/é?x=ü#ä', '/a/../b?q=a%26b', '/x?y=1&y=2']) {
        const once = safe(input);
        expect(once).not.toBeNull();
        expect(safe(once)).toBe(once);
      }
    });
  });

  describe('attacker input', () => {
    it('must not leave the origin via dot segments that collapse to a scheme-relative URL', () => {
      expect(safe('/..//evil.example')).toBeNull();
      expect(safe('/../..//evil.example/path')).toBeNull();
      expect(safe('/.//evil.example')).toBeNull();
      expect(safe('/%2e%2e//evil.example')).toBeNull();
      expect(safe('/%2E%2E//evil.example')).toBeNull();
      expect(safe('/.%2e//evil.example')).toBeNull();
      expect(safe('/a/..//evil.example')).toBeNull();
    });

    it('must not leave the origin via a scheme-relative or absolute URL', () => {
      expect(safe('//evil.example')).toBeNull();
      expect(safe('///evil.example')).toBeNull();
      expect(safe('https://evil.example')).toBeNull();
      expect(safe('http://evil.example/path')).toBeNull();
      expect(safe('javascript:alert(1)')).toBeNull();
      expect(safe('evil.example/path')).toBeNull();
    });

    it('must not leave the origin via a backslash, raw or encoded', () => {
      expect(safe('/\\evil.example')).toBeNull();
      expect(safe('\\\\evil.example')).toBeNull();
      expect(safe('/./\\evil.example')).toBeNull();
      expect(safe('/..%5c%5cevil.example')).toBeNull();
      expect(safe('/%5Cevil.example')).toBeNull();
      expect(safe('/home?next=\\evil')).toBeNull();
    });

    it('must not leave the origin via an encoded slash', () => {
      expect(safe('/%2Fevil.example')).toBeNull();
      expect(safe('/%2f%2fevil.example')).toBeNull();
      expect(safe('/..%2f%2fevil.example')).toBeNull();
    });

    it('must not split a header or a path via control characters', () => {
      expect(safe('/home\nSet-Cookie: x=1')).toBeNull();
      expect(safe('/\t/evil.example')).toBeNull();
      expect(safe('/home\u0000')).toBeNull();
      expect(safe('/home\u007f')).toBeNull();
    });

    it('must not carry userinfo', () => {
      expect(safe('/@evil.example')).toBe('/@evil.example');
      expect(toSafeRedirectPath('/home', { origin: 'https://user:pass@app.example.test' })).toBeNull();
    });

    it('must not redirect into backend routes', () => {
      expect(safe('/api/secret')).toBeNull();
      expect(safe('/API/secret')).toBeNull();
      expect(safe('/api')).toBeNull();
      expect(safe('/api?x=1')).toBeNull();
      expect(safe('/x/../api/secret')).toBeNull();
      expect(safe('/%2e%2e/api/secret')).toBeNull();
      expect(safe('/%61pi/secret')).toBeNull();
      expect(safe('/apiary')).toBe('/apiary');
      expect(safe('/docs', { denyPrefixes: ['/docs/'] })).toBeNull();
      expect(safe('/api/x', { denyPrefixes: [] })).toBe('/api/x');
    });

    it('refuses malformed percent-encoding, non-strings and empty input', () => {
      expect(safe('/%')).toBeNull();
      expect(safe('/%zz')).toBeNull();
      expect(safe('')).toBeNull();
      expect(safe(undefined)).toBeNull();
      expect(safe(null)).toBeNull();
      expect(safe(42)).toBeNull();
      expect(safe(['/home'])).toBeNull();
    });

    it('enforces the length cap on input and result', () => {
      expect(safe(`/${'a'.repeat(20)}`, { maxLength: 21 })).toBe(`/${'a'.repeat(20)}`);
      expect(safe(`/${'a'.repeat(21)}`, { maxLength: 21 })).toBeNull();
      // Percent-encoding lengthens the result past the cap.
      expect(safe(`/${'é'.repeat(5)}`, { maxLength: 21 })).toBeNull();
    });
  });
});
