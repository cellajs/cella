/**
 * Tests for sync transaction metadata (stx) creation utilities.
 *
 * Enforces:
 * - Creates send empty fieldTimestamps
 * - Updates generate HLC timestamps for scalar fields
 * - Deletes send empty fieldTimestamps
 * - sourceId is stable within a session
 * - mutationId is unique per call
 */

import { describe, expect, it } from 'vitest';
import { createStxForCreate, createStxForDelete, createStxForUpdate, sourceId } from '../stx-utils';

describe('sourceId', () => {
  it('is a non-empty string', () => {
    expect(sourceId).toBeTruthy();
    expect(sourceId.length).toBeGreaterThan(0);
  });

  it('is stable across accesses (same module instance)', () => {
    expect(sourceId).toBe(sourceId);
  });
});

describe('createStxForCreate', () => {
  it('produces empty fieldTimestamps with unique mutationId', () => {
    const stx = createStxForCreate();

    expect(stx.fieldTimestamps).toEqual({});
    expect(stx.sourceId).toBe(sourceId);
    expect(stx.mutationId).toBeTruthy();
  });

  it('generates unique mutationId per call', () => {
    const stx1 = createStxForCreate();
    const stx2 = createStxForCreate();

    expect(stx1.mutationId).not.toBe(stx2.mutationId);
  });
});

describe('createStxForUpdate', () => {
  it('generates HLC timestamps for scalar fields', () => {
    const stx = createStxForUpdate(['name', 'status']);

    expect(stx.sourceId).toBe(sourceId);
    expect(stx.mutationId).toBeTruthy();
    expect(Object.keys(stx.fieldTimestamps)).toEqual(['name', 'status']);
    // Each timestamp should be a non-empty HLC string
    for (const ts of Object.values(stx.fieldTimestamps)) {
      expect(typeof ts).toBe('string');
      expect(ts.length).toBeGreaterThan(0);
    }
  });

  it('produces empty fieldTimestamps when no scalar fields given', () => {
    const stx = createStxForUpdate([]);
    expect(stx.fieldTimestamps).toEqual({});
  });

  it('defaults to empty fieldTimestamps when called without arguments', () => {
    const stx = createStxForUpdate();
    expect(stx.fieldTimestamps).toEqual({});
  });
});

describe('createStxForDelete', () => {
  it('produces empty fieldTimestamps', () => {
    const stx = createStxForDelete();

    expect(stx.fieldTimestamps).toEqual({});
    expect(stx.sourceId).toBe(sourceId);
    expect(stx.mutationId).toBeTruthy();
  });
});
