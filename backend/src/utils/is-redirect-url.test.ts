import { describe, expect, it } from 'vitest';
import { isValidRedirectPath } from '#/utils/is-redirect-url';

describe('isValidRedirectPath', () => {
  it('accepts a simple same-origin path and returns the normalized path', () => {
    expect(isValidRedirectPath('/home')).toBe('/home');
  });

  it('preserves query and hash', () => {
    expect(isValidRedirectPath('/home?tab=members#top')).toBe('/home?tab=members#top');
  });

  it('rejects non-string input', () => {
    expect(isValidRedirectPath(undefined)).toBe(false);
    expect(isValidRedirectPath(null)).toBe(false);
    expect(isValidRedirectPath(42)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRedirectPath('')).toBe(false);
  });

  it('rejects scheme-relative open-redirect targets', () => {
    expect(isValidRedirectPath('//evil.example')).toBe(false);
    expect(isValidRedirectPath('//evil.example/path')).toBe(false);
  });

  it('rejects backslash authority tricks', () => {
    expect(isValidRedirectPath('/\\evil.example')).toBe(false);
    expect(isValidRedirectPath('\\\\evil.example')).toBe(false);
  });

  it('rejects encoded double-slash bypasses', () => {
    expect(isValidRedirectPath('/%2Fevil.example')).toBe(false);
  });

  it('rejects absolute URLs', () => {
    expect(isValidRedirectPath('https://evil.example')).toBe(false);
    expect(isValidRedirectPath('http://evil.example/path')).toBe(false);
  });

  it('rejects malformed percent-encoding', () => {
    expect(isValidRedirectPath('/%')).toBe(false);
  });

  it('rejects control characters', () => {
    expect(isValidRedirectPath('/home\nSet-Cookie: x=1')).toBe(false);
  });

  it('rejects backend-only routes', () => {
    expect(isValidRedirectPath('/api/secret')).toBe(false);
  });

  it('normalizes traversal that stays same-origin', () => {
    // `/../etc` resolves back to an origin-relative path, never escaping the origin.
    const result = isValidRedirectPath('/../etc');
    expect(result).not.toBe(false);
    expect(typeof result).toBe('string');
    expect((result as string).startsWith('/')).toBe(true);
  });
});
