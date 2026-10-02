import { describe, expect, it } from 'vitest';
import { keyStampIso, selectEventKeys } from './diag';

describe('keyStampIso', () => {
  it('reads the upload stamp of a bundle key', () => {
    expect(keyStampIso('backend-20261002T075610Z-events.jsonl')).toBe('2026-10-02T07:56:10Z');
    expect(keyStampIso('backend-stage-1-pull')).toBeUndefined();
  });
});

describe('selectEventKeys', () => {
  const keys = [
    'backend-20260929T211437Z-boot.log',
    'backend-20260929T211437Z-events.jsonl',
    'backend-20261002T075610Z-boot.log',
    'backend-20261002T075610Z-events.jsonl',
    'cdc-20260801T000000Z-events.jsonl',
  ];

  it('keeps the listed services’ event bundles (the keys are bare names under the boot-diag prefix)', () => {
    expect(selectEventKeys(keys, ['backend'])).toEqual(['backend-20260929T211437Z-events.jsonl', 'backend-20261002T075610Z-events.jsonl']);
  });

  it('narrows to the bundles beside one release’s boot transcripts and to a start time', () => {
    expect(selectEventKeys(keys, ['backend', 'cdc'], { bootLogKeys: ['backend-20261002T075610Z-boot.log'] })).toEqual([
      'backend-20261002T075610Z-events.jsonl',
    ]);
    expect(selectEventKeys(keys, ['backend', 'cdc'], { sinceIso: '2026-10-01T00:00:00Z' })).toEqual(['backend-20261002T075610Z-events.jsonl']);
    expect(selectEventKeys(keys, ['backend'], { bootLogKeys: [] })).toEqual([]);
  });
});
