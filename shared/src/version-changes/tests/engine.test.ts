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
    expect(currentSchemaVersion).toBe(2);
  });

  it('maps a global version to the latest entity node ≤ it', () => {
    expect(versionNodeFor('attachment', 0)).toBe('v0');
    expect(versionNodeFor('attachment', 1)).toBe('v1');
    expect(versionNodeFor('attachment', 2)).toBe('v1'); // page lens at ordinal 2 adds no attachment node
    expect(versionNodeFor('page', 1)).toBe('v0');
    expect(versionNodeFor('page', 2)).toBe('v2');
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

  it('fills added fields with their default', async () => {
    const migrated = await migrateCachedEntity('page', { id: '1', title: 'doc' }, 0);
    expect(migrated).toEqual({ id: '1', title: 'doc', archived: false });
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
