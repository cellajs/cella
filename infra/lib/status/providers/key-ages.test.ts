import { describe, expect, it } from 'vitest';
import { keyAgesLine } from './stack';

describe('keyAgesLine', () => {
  it('lists every key oldest first, in days, and judges none: no age is a deadline', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(
      keyAgesLine(
        [
          { application: 'app-observer', createdAt: '2026-10-14T09:00:00Z' },
          { application: 'app-operator', createdAt: '2026-10-04T12:00:00Z' },
        ],
        now,
      ),
    ).toBe('app-operator 10 d, app-observer 0 d');
  });
});
