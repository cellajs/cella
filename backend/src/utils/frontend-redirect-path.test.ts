import { describe, expect, it } from 'vitest';
import { maxLength } from '#/db/utils/constraints';
import { frontendRedirectPath } from '#/utils/frontend-redirect-path';

describe('frontendRedirectPath', () => {
  it('accepts a simple same-origin path and returns the normalized path', () => {
    expect(frontendRedirectPath('/home')).toBe('/home');
  });

  it('preserves query and hash', () => {
    expect(frontendRedirectPath('/home?tab=members#top')).toBe('/home?tab=members#top');
  });

  it('rejects non-string input', () => {
    expect(frontendRedirectPath(undefined)).toBeNull();
    expect(frontendRedirectPath(null)).toBeNull();
    expect(frontendRedirectPath(42)).toBeNull();
  });

  it('rejects empty string', () => {
    expect(frontendRedirectPath('')).toBeNull();
  });

  it('rejects scheme-relative open-redirect targets', () => {
    expect(frontendRedirectPath('//evil.example')).toBeNull();
    expect(frontendRedirectPath('//evil.example/path')).toBeNull();
  });

  it('rejects backslash authority tricks', () => {
    expect(frontendRedirectPath('/\\evil.example')).toBeNull();
    expect(frontendRedirectPath('\\\\evil.example')).toBeNull();
  });

  it('rejects encoded double-slash bypasses', () => {
    expect(frontendRedirectPath('/%2Fevil.example')).toBeNull();
  });

  it('rejects absolute URLs', () => {
    expect(frontendRedirectPath('https://evil.example')).toBeNull();
    expect(frontendRedirectPath('http://evil.example/path')).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(frontendRedirectPath('/%')).toBeNull();
  });

  it('rejects control characters', () => {
    expect(frontendRedirectPath('/home\nSet-Cookie: x=1')).toBeNull();
  });

  it('rejects backend-only routes', () => {
    expect(frontendRedirectPath('/api/secret')).toBeNull();
  });

  it('normalizes traversal that stays same-origin', () => {
    expect(frontendRedirectPath('/../etc')).toBe('/etc');
  });

  it('caps the result at the stored column length', () => {
    expect(frontendRedirectPath(`/${'a'.repeat(maxLength.field - 1)}`)).toBe(`/${'a'.repeat(maxLength.field - 1)}`);
    expect(frontendRedirectPath(`/${'a'.repeat(maxLength.field)}`)).toBeNull();
  });
});
