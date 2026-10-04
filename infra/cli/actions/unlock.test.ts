import { describe, expect, it } from 'vitest';
import { lockVerdict } from './unlock';

const now = Date.parse('2026-10-04T12:00:00.000Z');

describe('lockVerdict', () => {
  it('reports no lock', () => {
    expect(lockVerdict(undefined, now)).toBe('none');
  });

  it('calls a lapsed lease expired, so it is removed without a question', () => {
    expect(lockVerdict({ expiresAt: '2026-10-04T11:59:59.000Z' }, now)).toBe('expired');
    expect(lockVerdict({ expiresAt: '2026-10-04T12:00:00.000Z' }, now)).toBe('expired');
  });

  it('calls a running lease live, so removing it needs a confirmation', () => {
    expect(lockVerdict({ expiresAt: '2026-10-04T12:02:30.000Z' }, now)).toBe('live');
  });
});
