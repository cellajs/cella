import { describe, expect, it } from 'vitest';
import { recordPausedMutation } from '../mutation-queue';
import { createStxForCreate, createStxForDelete, createStxForUpdate, sourceId, withReplayFlag } from '../stx-utils';

// Covers stx metadata shape for create, update, delete, and source identity.
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

describe('withReplayFlag', () => {
  it('leaves a live edit unflagged, so the server orders it by arrival', () => {
    const stx = createStxForUpdate(['name']);
    expect(withReplayFlag(stx).replayed).toBeUndefined();
  });

  it('flags a mutation that paused offline, so the server arbitrates it by its intent-time timestamps', () => {
    const stx = createStxForUpdate(['name']);
    recordPausedMutation(stx.mutationId);
    const flagged = withReplayFlag(stx);
    expect(flagged.replayed).toBe(true);
    expect(flagged.fieldTimestamps).toEqual(stx.fieldTimestamps);
  });
});
