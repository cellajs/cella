import { describe, expect, it } from 'vitest';
import { defineLens } from '../define';
import { currentSchemaVersion, migrateCachedEntity, normalizeOps } from '../engine';

// No mock here: exercises the real (empty) lens list shipped in lens-list.ts.
// Every runtime touch point must be a safe passthrough until a lens is appended.
describe('empty lens list — passthrough', () => {
  it('currentSchemaVersion is 0', () => {
    expect(currentSchemaVersion).toBe(0);
  });

  it('normalizeOps returns input unchanged', () => {
    const ops = { name: 'x' };
    const stx = { fieldTimestamps: { name: 't' } };
    const result = normalizeOps('attachment', ops, stx);
    expect(result.ops).toBe(ops);
    expect(result.stx).toBe(stx);
  });

  it('migrateCachedEntity returns input unchanged', async () => {
    const row = { id: '1', name: 'x' };
    expect(await migrateCachedEntity('attachment', row, 0)).toBe(row);
  });
});

describe('defineLens validation', () => {
  it('rejects a malformed id', () => {
    expect(() =>
      defineLens({
        id: 'not-a-date',
        entityType: 'attachment',
        description: 'bad',
        phase: 'expand',
        delta: { rename: { from: 'a', to: 'b' } },
      }),
    ).toThrow(/date-prefixed/);
  });

  it('requires custom.opsConvert for retype deltas', () => {
    expect(() =>
      defineLens({
        id: '2026-07-01-attachment-retype',
        entityType: 'attachment',
        description: 'retype',
        phase: 'expand',
        delta: { retype: { field: 'size' } },
      }),
    ).toThrow(/opsConvert/);
  });
});
