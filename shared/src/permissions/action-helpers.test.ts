import { describe, expect, it } from 'vitest';
import { isUnconditionalPermission, resolvePermission } from './action-helpers';

describe('resolvePermission', () => {
  // --- Pass cases: permission should be granted ---

  it('returns true for unconditional true permission', () => {
    expect(resolvePermission(true, 'user-a', 'user-b')).toBe(true);
  });

  it('returns true for unconditional true even without userId or createdBy', () => {
    expect(resolvePermission(true, undefined, undefined)).toBe(true);
    expect(resolvePermission(true, null, undefined)).toBe(true);
    expect(resolvePermission(true)).toBe(true);
  });

  it('returns true for own permission when user is the creator', () => {
    expect(resolvePermission('own', 'user-123', 'user-123')).toBe(true);
  });

  // --- Fail cases: permission should be denied ---

  it('returns false for unconditional false permission', () => {
    expect(resolvePermission(false, 'user-a', 'user-a')).toBe(false);
  });

  it('returns false for own permission when user is NOT the creator', () => {
    expect(resolvePermission('own', 'user-creator', 'user-other')).toBe(false);
  });

  it('returns false for own permission when userId is missing', () => {
    expect(resolvePermission('own', 'user-creator', undefined)).toBe(false);
  });

  it('returns false for own permission when createdBy is missing', () => {
    expect(resolvePermission('own', undefined, 'user-123')).toBe(false);
    expect(resolvePermission('own', null, 'user-123')).toBe(false);
  });

  it('returns false for own permission when both userId and createdBy are missing', () => {
    expect(resolvePermission('own', undefined, undefined)).toBe(false);
  });

  it('returns false for undefined permission (defaults to deny)', () => {
    expect(resolvePermission(undefined, 'user-a', 'user-a')).toBe(false);
  });

  // --- Edge cases ---

  it('returns false for own permission with empty string userId', () => {
    expect(resolvePermission('own', 'user-creator', '')).toBe(false);
  });

  it('returns false for own permission with empty string createdBy', () => {
    expect(resolvePermission('own', '', 'user-123')).toBe(false);
  });

  it('does not coerce types — string comparison is exact', () => {
    // IDs must be exact string matches, no loose comparison
    expect(resolvePermission('own', '123', '123')).toBe(true);
    expect(resolvePermission('own', ' 123', '123')).toBe(false);
    expect(resolvePermission('own', '123 ', '123')).toBe(false);
  });
});

describe('isUnconditionalPermission', () => {
  it('is true only for an unconditional grant', () => {
    expect(isUnconditionalPermission(true)).toBe(true);
  });

  it('is false for a row-conditional grant — it depends on the row, which this cannot see', () => {
    // The whole point: context-scoped features (e.g. collab editing) enable on this, and `'own'`
    // must NOT enable them, because ownership is per-row and unknown here.
    expect(isUnconditionalPermission('own')).toBe(false);
  });

  it('is false for denied or absent', () => {
    expect(isUnconditionalPermission(false)).toBe(false);
    expect(isUnconditionalPermission(undefined)).toBe(false);
  });
});

