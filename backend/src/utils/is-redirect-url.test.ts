import { describe, expect, it } from 'vitest';
import { maxLength } from '#/db/utils/constraints';
import { isValidRedirectPath } from '#/utils/is-redirect-url';

describe('isValidRedirectPath', () => {
  it('accepts a simple same-origin path and returns the normalized path', () => {
    expect(isValidRedirectPath('/home')).toBe('/home');
  });

  it('preserves query and hash', () => {
    expect(isValidRedirectPath('/home?tab=members#top')).toBe('/home?tab=members#top');
  });

  it('rejects non-string input', () => {
    expect(isValidRedirectPath(undefined)).toBeNull();
    expect(isValidRedirectPath(null)).toBeNull();
    expect(isValidRedirectPath(42)).toBeNull();
  });

  it('rejects empty string', () => {
    expect(isValidRedirectPath('')).toBeNull();
  });

  it('rejects scheme-relative open-redirect targets', () => {
    expect(isValidRedirectPath('//evil.example')).toBeNull();
    expect(isValidRedirectPath('//evil.example/path')).toBeNull();
  });

  it('rejects backslash authority tricks', () => {
    expect(isValidRedirectPath('/\\evil.example')).toBeNull();
    expect(isValidRedirectPath('\\\\evil.example')).toBeNull();
  });

  it('rejects encoded double-slash bypasses', () => {
    expect(isValidRedirectPath('/%2Fevil.example')).toBeNull();
  });

  it('rejects absolute URLs', () => {
    expect(isValidRedirectPath('https://evil.example')).toBeNull();
    expect(isValidRedirectPath('http://evil.example/path')).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(isValidRedirectPath('/%')).toBeNull();
  });

  it('rejects control characters', () => {
    expect(isValidRedirectPath('/home\nSet-Cookie: x=1')).toBeNull();
  });

  it('rejects backend-only routes', () => {
    expect(isValidRedirectPath('/api/secret')).toBeNull();
  });

  it('normalizes traversal that stays same-origin', () => {
    expect(isValidRedirectPath('/../etc')).toBe('/etc');
  });

  it('caps the result at the stored column length', () => {
    expect(isValidRedirectPath(`/${'a'.repeat(maxLength.field - 1)}`)).toBe(`/${'a'.repeat(maxLength.field - 1)}`);
    expect(isValidRedirectPath(`/${'a'.repeat(maxLength.field)}`)).toBeNull();
  });
});
