// DORMANT: tests the dormant lens cache-migration module (not wired into runtime).
// Kept for coverage; see info/SCHEMA_EVOLUTION.md.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the lens engine: simulate a single attachment rename name → title.
vi.mock('shared/version-changes', () => ({
  migrateCachedEntity: vi.fn(async (_entityType: string, entity: Record<string, unknown>) => {
    if ('name' in entity) {
      const { name, ...rest } = entity;
      return { ...rest, title: name };
    }
    return entity;
  }),
  migrateQueuedMutation: vi.fn((_entityType: string, variables: Record<string, unknown>) => {
    if ('name' in variables) {
      const { name, ...rest } = variables;
      return { ...rest, title: name };
    }
    return variables;
  }),
}));

import { entityTypeOf, migrateMutations, migrateQueryState } from '../cache-migration';

beforeEach(() => vi.clearAllMocks());

describe('entityTypeOf', () => {
  it('extracts a product entity type from a query key', () => {
    expect(entityTypeOf(['attachment', 'list'])).toBe('attachment');
    expect(entityTypeOf(['page'])).toBe('page');
  });

  it('returns null for non-product keys', () => {
    expect(entityTypeOf(['organization'])).toBeNull();
    expect(entityTypeOf('attachment')).toBeNull();
    expect(entityTypeOf(undefined)).toBeNull();
  });
});

describe('migrateQueryState', () => {
  it('migrates a single entity', async () => {
    const state = await migrateQueryState('attachment', { data: { id: '1', name: 'pic' } }, 0);
    expect(state.data).toEqual({ id: '1', title: 'pic' });
  });

  it('migrates an array of entities', async () => {
    const state = await migrateQueryState(
      'attachment',
      {
        data: [
          { id: '1', name: 'a' },
          { id: '2', name: 'b' },
        ],
      },
      0,
    );
    expect(state.data).toEqual([
      { id: '1', title: 'a' },
      { id: '2', title: 'b' },
    ]);
  });

  it('migrates { items } lists', async () => {
    const state = await migrateQueryState('attachment', { data: { items: [{ id: '1', name: 'a' }], total: 1 } }, 0);
    expect(state.data).toEqual({ items: [{ id: '1', title: 'a' }], total: 1 });
  });

  it('migrates infinite { pages } shape', async () => {
    const state = await migrateQueryState(
      'attachment',
      { data: { pages: [{ items: [{ id: '1', name: 'a' }] }], pageParams: [0] } },
      0,
    );
    expect(state.data).toEqual({ pages: [{ items: [{ id: '1', title: 'a' }] }], pageParams: [0] });
  });

  it('leaves undefined data alone', async () => {
    const state = await migrateQueryState('attachment', { data: undefined }, 0);
    expect(state.data).toBeUndefined();
  });
});

describe('migrateMutations', () => {
  it('rewrites variables for product-entity mutations', () => {
    const result = migrateMutations(
      [{ mutationKey: ['attachment', 'update'], state: { variables: { name: 'x' } } } as any],
      0,
    );
    expect(result[0].state.variables).toEqual({ title: 'x' });
  });

  it('skips mutations without a product entity key', () => {
    const input = [{ mutationKey: ['organization'], state: { variables: { name: 'x' } } } as any];
    expect(migrateMutations(input, 0)[0].state.variables).toEqual({ name: 'x' });
  });
});
