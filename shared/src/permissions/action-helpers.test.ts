import { describe, expect, it } from 'vitest';
import { isUnconditionalCan, resolveCan } from './action-helpers';

describe('resolveCan', () => {
  // --- Pass cases: permission should be granted ---

  it('returns true for unconditional true permission', () => {
    expect(resolveCan(true, 'user-a', 'user-b')).toBe(true);
  });

  it('returns true for unconditional true even without userId or createdBy', () => {
    expect(resolveCan(true, undefined, undefined)).toBe(true);
    expect(resolveCan(true, null, undefined)).toBe(true);
    expect(resolveCan(true)).toBe(true);
  });

  it('returns true for own permission when user is the creator', () => {
    expect(resolveCan('own', 'user-123', 'user-123')).toBe(true);
  });

  // --- Fail cases: permission should be denied ---

  it('returns false for unconditional false permission', () => {
    expect(resolveCan(false, 'user-a', 'user-a')).toBe(false);
  });

  it('returns false for own permission when user is NOT the creator', () => {
    expect(resolveCan('own', 'user-creator', 'user-other')).toBe(false);
  });

  it('returns false for own permission when userId is missing', () => {
    expect(resolveCan('own', 'user-creator', undefined)).toBe(false);
  });

  it('returns false for own permission when createdBy is missing', () => {
    expect(resolveCan('own', undefined, 'user-123')).toBe(false);
    expect(resolveCan('own', null, 'user-123')).toBe(false);
  });

  it('returns false for own permission when both userId and createdBy are missing', () => {
    expect(resolveCan('own', undefined, undefined)).toBe(false);
  });

  it('returns false for undefined permission (defaults to deny)', () => {
    expect(resolveCan(undefined, 'user-a', 'user-a')).toBe(false);
  });

  // --- Edge cases ---

  it('returns false for own permission with empty string userId', () => {
    expect(resolveCan('own', 'user-creator', '')).toBe(false);
  });

  it('returns false for own permission with empty string createdBy', () => {
    expect(resolveCan('own', '', 'user-123')).toBe(false);
  });

  it('does not coerce types — string comparison is exact', () => {
    // IDs must be exact string matches, no loose comparison
    expect(resolveCan('own', '123', '123')).toBe(true);
    expect(resolveCan('own', ' 123', '123')).toBe(false);
    expect(resolveCan('own', '123 ', '123')).toBe(false);
  });
});

describe('isUnconditionalCan', () => {
  it('is true only for an unconditional grant', () => {
    expect(isUnconditionalCan(true)).toBe(true);
  });

  it('is false for a row-conditional grant — it depends on the row, which this cannot see', () => {
    // The whole point: channel-wide features (e.g. collab editing) enable on this, and `'own'`
    // must NOT enable them, because ownership is per-row and unknown here.
    expect(isUnconditionalCan('own')).toBe(false);
  });

  it('is false for denied or absent', () => {
    expect(isUnconditionalCan(false)).toBe(false);
    expect(isUnconditionalCan(undefined)).toBe(false);
  });
});

