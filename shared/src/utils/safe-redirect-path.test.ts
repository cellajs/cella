import { describe, expect, it } from 'vitest';
import { safeRedirectPath as safe } from './safe-redirect-path.ts';

describe('safeRedirectPath', () => {
  describe('legitimate paths (positive controls)', () => {
    it('keeps a plain path, its query and its hash', () => {
      expect(safe('/home')).toBe('/home');
      expect(safe('/home?tab=members#top')).toBe('/home?tab=members#top');
      expect(safe('/acme/organization/members?q=jane&sort=name#row-2')).toBe('/acme/organization/members?q=jane&sort=name#row-2');
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
        expect(once).not.toBeUndefined();
        expect(safe(once)).toBe(once);
      }
    });
  });

  describe('attacker input', () => {
    it('must not leave the origin via dot segments that collapse to a scheme-relative URL', () => {
      expect(safe('/..//evil.example')).toBeUndefined();
      expect(safe('/../..//evil.example/path')).toBeUndefined();
      expect(safe('/.//evil.example')).toBeUndefined();
      expect(safe('/%2e%2e//evil.example')).toBeUndefined();
      expect(safe('/%2E%2E//evil.example')).toBeUndefined();
      expect(safe('/.%2e//evil.example')).toBeUndefined();
      expect(safe('/a/..//evil.example')).toBeUndefined();
    });

    it('must not leave the origin via a scheme-relative or absolute URL', () => {
      expect(safe('//evil.example')).toBeUndefined();
      expect(safe('///evil.example')).toBeUndefined();
      expect(safe('https://evil.example')).toBeUndefined();
      expect(safe('http://evil.example/path')).toBeUndefined();
      expect(safe('javascript:alert(1)')).toBeUndefined();
      expect(safe('evil.example/path')).toBeUndefined();
    });

    it('must not leave the origin via a backslash, raw or encoded', () => {
      expect(safe('/\\evil.example')).toBeUndefined();
      expect(safe('\\\\evil.example')).toBeUndefined();
      expect(safe('/./\\evil.example')).toBeUndefined();
      expect(safe('/..%5c%5cevil.example')).toBeUndefined();
      expect(safe('/%5Cevil.example')).toBeUndefined();
      expect(safe('/home?next=\\evil')).toBeUndefined();
    });

    it('must not leave the origin via an encoded slash', () => {
      expect(safe('/%2Fevil.example')).toBeUndefined();
      expect(safe('/%2f%2fevil.example')).toBeUndefined();
      expect(safe('/..%2f%2fevil.example')).toBeUndefined();
    });

    it('must not split a header or a path via control characters', () => {
      expect(safe('/home\nSet-Cookie: x=1')).toBeUndefined();
      expect(safe('/\t/evil.example')).toBeUndefined();
      expect(safe('/home\u0000')).toBeUndefined();
      expect(safe('/home\u007f')).toBeUndefined();
    });

    it('must not carry userinfo', () => {
      expect(safe('/@evil.example')).toBe('/@evil.example');
    });

    it('must not redirect into backend routes', () => {
      expect(safe('/api/secret')).toBeUndefined();
      expect(safe('/API/secret')).toBeUndefined();
      expect(safe('/api')).toBeUndefined();
      expect(safe('/api?x=1')).toBeUndefined();
      expect(safe('/x/../api/secret')).toBeUndefined();
      expect(safe('/%2e%2e/api/secret')).toBeUndefined();
      expect(safe('/%61pi/secret')).toBeUndefined();
      expect(safe('/apiary')).toBe('/apiary');
    });

    it('refuses malformed percent-encoding, non-strings and empty input', () => {
      expect(safe('/%')).toBeUndefined();
      expect(safe('/%zz')).toBeUndefined();
      expect(safe('')).toBeUndefined();
      expect(safe(undefined)).toBeUndefined();
      expect(safe(null)).toBeUndefined();
      expect(safe(42)).toBeUndefined();
      expect(safe(['/home'])).toBeUndefined();
    });

    it('enforces the length cap on input and result', () => {
      expect(safe(`/${'a'.repeat(20)}`, 21)).toBe(`/${'a'.repeat(20)}`);
      expect(safe(`/${'a'.repeat(21)}`, 21)).toBeUndefined();
      // Percent-encoding lengthens the result past the cap.
      expect(safe(`/${'é'.repeat(5)}`, 21)).toBeUndefined();
    });
  });
});
