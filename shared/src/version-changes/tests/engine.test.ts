import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLens } from '../define';

// Inject synthetic lenses so the engine can be exercised without shipping a real
// (schema-breaking) lens. Ordinal = index + 1.
vi.mock('../lens-list', () => ({
  lenses: [
    defineLens({
      id: '2026-07-01-attachment-name-to-title',
      entityType: 'attachment',
      description: 'rename attachment.name → title',
      phase: 'expand',
      delta: { rename: { from: 'name', to: 'title' } },
    }),
    defineLens({
      id: '2026-07-02-page-add-archived',
      entityType: 'page',
      description: 'add page.archived',
      phase: 'expand',
      delta: { add: { field: 'archived', default: false } },
    }),
    defineLens({
      id: '2026-07-03-page-add-label',
      entityType: 'page',
      description: 'add page.label (computed default)',
      phase: 'expand',
      delta: { add: { field: 'label', default: (row: Record<string, unknown>) => `page-${row.id}` } },
    }),
  ],
}));

import {
  currentSchemaVersion,
  downgradeEntity,
  migrateCachedEntity,
  migrateQueuedMutation,
  normalizeOps,
  resetLensEngine,
  versionNodeFor,
  widenedOpsKeyMap,
} from '../engine';

beforeEach(() => resetLensEngine());

describe('currentSchemaVersion + versionNodeFor', () => {
  it('equals the lens count', () => {
    expect(currentSchemaVersion).toBe(3);
  });

  it('maps a global version to the latest entity node ≤ it', () => {
    expect(versionNodeFor('attachment', 0)).toBe('v0');
    expect(versionNodeFor('attachment', 1)).toBe('v1');
    expect(versionNodeFor('attachment', 3)).toBe('v1'); // page lenses at ordinals 2/3 add no attachment node
    expect(versionNodeFor('page', 1)).toBe('v0');
    expect(versionNodeFor('page', 2)).toBe('v2');
    expect(versionNodeFor('page', 3)).toBe('v3');
  });
});

describe('normalizeOps (server seam)', () => {
  it('canonicalizes old keys and mirror-writes the twin during expand', () => {
    const { ops, stx } = normalizeOps('attachment', { name: 'hello' }, { fieldTimestamps: { name: '100:0001:aaa' } });
    expect(ops).toEqual({ title: 'hello', name: 'hello' });
    expect(stx.fieldTimestamps).toEqual({ title: '100:0001:aaa', name: '100:0001:aaa' });
  });

  it('does not mutate the input objects', () => {
    const ops = { name: 'hello' };
    const stx = { fieldTimestamps: { name: '100:0001:aaa' } };
    normalizeOps('attachment', ops, stx);
    expect(ops).toEqual({ name: 'hello' });
    expect(stx.fieldTimestamps).toEqual({ name: '100:0001:aaa' });
  });

  it('leaves entities with no rename lens untouched (add)', () => {
    const { ops } = normalizeOps('page', { title: 'x' }, { fieldTimestamps: {} });
    expect(ops).toEqual({ title: 'x' });
  });
});

describe('migrateCachedEntity (client boot)', () => {
  it('renames a cached row and its stx timestamps forward', async () => {
    const migrated = await migrateCachedEntity(
      'attachment',
      { id: '1', name: 'pic', stx: { fieldTimestamps: { name: 't1' } } },
      0,
    );
    expect(migrated).toEqual({ id: '1', title: 'pic', stx: { fieldTimestamps: { title: 't1' } } });
  });

  it('is idempotent when already at current version', async () => {
    const row = { id: '1', title: 'pic', stx: { fieldTimestamps: { title: 't1' } } };
    const migrated = await migrateCachedEntity('attachment', row, 1);
    expect(migrated).toEqual(row);
  });

  it('fills added fields with their default (static and computed)', async () => {
    const migrated = await migrateCachedEntity('page', { id: '1', title: 'doc' }, 0);
    expect(migrated).toEqual({ id: '1', title: 'doc', archived: false, label: 'page-1' });
  });
});

describe('downgradeEntity (Phase 2)', () => {
  it('round-trips a rename back to the old shape', async () => {
    const forward = await migrateCachedEntity('attachment', { id: '1', name: 'pic' }, 0);
    const back = await downgradeEntity('attachment', forward, 0);
    expect(back).toEqual({ id: '1', name: 'pic' });
  });
});

describe('migrateQueuedMutation (client replay)', () => {
  it('rewrites ops + stx keys forward', () => {
    const rewritten = migrateQueuedMutation(
      'attachment',
      { ops: { name: 'x' }, stx: { fieldTimestamps: { name: 't' } } },
      0,
    );
    expect(rewritten).toEqual({ ops: { title: 'x' }, stx: { fieldTimestamps: { title: 't' } } });
  });

  it('is a no-op when already current', () => {
    const vars = { ops: { title: 'x' } };
    expect(migrateQueuedMutation('attachment', vars, 1)).toEqual(vars);
  });
});

describe('widenedOpsKeyMap', () => {
  it('exposes old→new aliases for expand lenses', () => {
    expect(widenedOpsKeyMap('attachment')).toEqual({ name: 'title' });
    expect(widenedOpsKeyMap('page')).toEqual({});
  });
});

describe('normalizeOps unknown-field handling', () => {
  const canonicalKeys = new Set(['title']);

  it('reports nothing without canonicalKeys', () => {
    const { unknownFields } = normalizeOps('attachment', { name: 'x', bogus: 1 }, {});
    expect(unknownFields).toEqual([]);
  });

  it('exempts canonical keys and expand-window twins', () => {
    const { ops, unknownFields } = normalizeOps('attachment', { name: 'x' }, {}, { canonicalKeys });
    expect(unknownFields).toEqual([]);
    expect(ops).toEqual({ title: 'x', name: 'x' }); // mirror-written twin survives
  });

  it('strips unmappable fields (default policy) from ops and fieldTimestamps', () => {
    const { ops, stx, unknownFields } = normalizeOps(
      'attachment',
      { name: 'x', bogus: 1 },
      { fieldTimestamps: { name: 't', bogus: 't2' } },
      { canonicalKeys },
    );
    expect(unknownFields).toEqual(['bogus']);
    expect(ops).toEqual({ title: 'x', name: 'x' });
    expect(stx.fieldTimestamps).toEqual({ title: 't', name: 't' });
  });

  it('passes unmappable fields through under ignore', () => {
    const { ops, unknownFields } = normalizeOps(
      'attachment',
      { name: 'x', bogus: 1 },
      {},
      { canonicalKeys, unknownFieldHandling: 'ignore' },
    );
    expect(unknownFields).toEqual(['bogus']);
    expect(ops).toEqual({ title: 'x', name: 'x', bogus: 1 });
  });

  it('throws under fail', () => {
    expect(() => normalizeOps('attachment', { bogus: 1 }, {}, { canonicalKeys, unknownFieldHandling: 'fail' })).toThrow(
      /unmappable fields.*bogus/,
    );
  });
});
