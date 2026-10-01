import '~/query/tests/query-client-env';
import type { ProductEntityType } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemData } from '~/query/basic/types';

// Synthetic app: 'label' is a product embedded on the 'task' product, both homed at 'project'.
// Base cella configures no embeddings, so the relationship only exists in this file's mock.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .product('label', { parent: 'project' })
    .build();
  return {
    ...actual,
    appConfig: {
      channelEntityTypes: hierarchy.channelTypes,
      entityIdColumnKeys: hierarchy.idColumnKeys,
      productEmbeddings: [{ embeddedProduct: 'label', hostProduct: 'task', hostColumn: 'labels' }],
    },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { collectEmbeddingTouches, invalidateEmbeddedForHost, invalidateEmbeddedUsage, propagateEmbeddedProduct } = await import('./propagation');
type EmbeddingTouches = Map<ProductEntityType, Set<string>>;

// The synthetic 'label' and 'task' types exist only in this file's shared mock, hence the casts.
const LABEL = 'label' as ProductEntityType;
/** Host rows are arbitrary server shapes; ItemData only pins `id`. */
const row = (data: Record<string, unknown>) => data as unknown as ItemData;
const touchesFor = (ids: string[], product = LABEL): EmbeddingTouches => new Map([[product, new Set(ids)]]);
const ORG = 'org-1';
const PROJECT = 'project-1';

const labelKeys = createEntityKeys<Record<string, never>>(LABEL);

/** Registers the label type and seeds one home list, returning the key it was cached under. */
function seedLabelHomeList(labels: { id: string; projectId: string | null }[]) {
  registerEntityQueryKeys(LABEL, labelKeys, async () => ({ items: [], total: 0 }));
  const key = labelKeys.list.home(ORG, PROJECT);
  queryClient.setQueryData(key, { items: labels, total: labels.length });
  return key;
}

const isInvalidated = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated === true;

describe('embedded-product usage invalidation', () => {
  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  describe('collectEmbeddingTouches', () => {
    it('records only the symmetric difference when the previous row is known', () => {
      const touches: EmbeddingTouches = new Map();
      collectEmbeddingTouches('task', row({ id: 't1', labels: ['a', 'b'] }), row({ id: 't1', labels: ['b', 'c'] }), touches);
      expect([...(touches.get(LABEL) ?? [])].sort()).toEqual(['a', 'c']);
    });

    it('ignores an edit that leaves the embedding column alone', () => {
      const touches: EmbeddingTouches = new Map();
      collectEmbeddingTouches('task', row({ id: 't1', labels: ['a'], name: 'before' }), row({ id: 't1', labels: ['a'], name: 'after' }), touches);
      expect(touches.size).toBe(0);
    });

    it('takes every current reference as touched when no previous row is cached', () => {
      // A create, or an update to a row this client never held: the delta is unknowable, so over-invalidate.
      const touches: EmbeddingTouches = new Map();
      collectEmbeddingTouches('task', undefined, row({ id: 't1', labels: ['a', 'b'] }), touches);
      expect([...(touches.get(LABEL) ?? [])].sort()).toEqual(['a', 'b']);
    });

    it('reads ids out of embedded copies, not just id arrays', () => {
      const touches: EmbeddingTouches = new Map();
      collectEmbeddingTouches('task', undefined, row({ id: 't1', labels: [{ id: 'a', name: 'urgent' }] }), touches);
      expect([...(touches.get(LABEL) ?? [])]).toEqual(['a']);
    });

    it('ignores host types that embed nothing', () => {
      const touches: EmbeddingTouches = new Map();
      collectEmbeddingTouches('attachment', undefined, row({ id: 'a1', labels: ['a'] }), touches);
      expect(touches.size).toBe(0);
    });
  });

  describe('invalidateEmbeddedUsage', () => {
    it('narrows to the home list of a cached embedded row', () => {
      const homeKey = seedLabelHomeList([{ id: 'a', projectId: PROJECT }]);
      const otherKey = labelKeys.list.home(ORG, 'project-2');
      queryClient.setQueryData(otherKey, { items: [], total: 0 });

      invalidateEmbeddedUsage(touchesFor(['a']), ORG);

      expect(isInvalidated(homeKey)).toBe(true);
      expect(isInvalidated(otherKey)).toBe(false);
    });

    it('widens to the org list when a touched row is not cached anywhere', () => {
      const homeKey = seedLabelHomeList([{ id: 'a', projectId: PROJECT }]);
      // 'ghost' has no cached row, so its home cannot be resolved and every home must refetch.
      invalidateEmbeddedUsage(touchesFor(['a', 'ghost']), ORG);

      expect(isInvalidated(homeKey)).toBe(true);
    });

    it('does nothing for an embedded type with no registered query keys', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      invalidateEmbeddedUsage(touchesFor(['a'], 'unregistered' as ProductEntityType), ORG);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('invalidateEmbeddedForHost', () => {
    it('invalidates the embedded product org-wide when the host bypassed the diff', () => {
      seedLabelHomeList([{ id: 'a', projectId: PROJECT }]);
      const orgKey = labelKeys.list.org(ORG);
      queryClient.setQueryData(orgKey, { items: [], total: 0 });

      invalidateEmbeddedForHost('task', ORG);

      expect(isInvalidated(orgKey)).toBe(true);
    });

    it('is a no-op for a host product that embeds nothing', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      invalidateEmbeddedForHost('label', ORG);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('propagateEmbeddedProduct', () => {
  const TASK = 'task' as ProductEntityType;
  const taskKeys = createEntityKeys<Record<string, never>>(TASK);
  const infiniteKey = [...taskKeys.list.org(ORG), { q: '' }];
  const flatKey = taskKeys.list.home(ORG, PROJECT);

  const label = (id: string, name: string, updatedAt: string) => ({ id, name, updatedAt });

  beforeEach(() => {
    registerEntityQueryKeys(TASK, taskKeys, async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys(LABEL, labelKeys, async () => ({ items: [], total: 0 }));
  });
  afterEach(() => queryClient.clear());

  it('swaps in a newer embedded copy on the page that holds it and keeps the other page', () => {
    queryClient.setQueryData(labelKeys.detail.byId('l1'), label('l1', 'new', '2026-02-01'));
    queryClient.setQueryData(infiniteKey, {
      pages: [
        {
          items: [{ id: 't1', labels: [label('l1', 'old', '2026-01-01'), label('l2', 'kept', '2026-01-01')] }],
          total: 2,
        },
        { items: [{ id: 't2', labels: [label('l2', 'kept', '2026-01-01')] }], total: 2 },
      ],
      pageParams: [
        { page: 0, offset: 0 },
        { page: 1, offset: 1 },
      ],
    });
    const before = queryClient.getQueryData<{ pages: { items: ItemData[] }[]; pageParams: unknown[] }>(infiniteKey);

    propagateEmbeddedProduct(LABEL, ['l1'], 'update');

    const after = queryClient.getQueryData<typeof before>(infiniteKey);
    expect(after?.pages[0].items[0]).toEqual({ id: 't1', labels: [label('l1', 'new', '2026-02-01'), label('l2', 'kept', '2026-01-01')] });
    expect(after?.pages[1]).toBe(before?.pages[1]);
    expect(after?.pageParams).toBe(before?.pageParams);
  });

  it('keeps a cached copy that is as new as the fresh one', () => {
    queryClient.setQueryData(labelKeys.detail.byId('l1'), label('l1', 'fresh', '2026-01-01'));
    queryClient.setQueryData(flatKey, {
      items: [{ id: 't1', labels: [label('l1', 'local edit', '2026-01-01')] }],
      total: 1,
    });
    const before = queryClient.getQueryData(flatKey);

    propagateEmbeddedProduct(LABEL, ['l1'], 'update');

    expect(queryClient.getQueryData(flatKey)).toBe(before);
  });

  it('strips a removed id from id arrays, embedded copies and single object columns', () => {
    queryClient.setQueryData(flatKey, {
      items: [
        { id: 't1', labels: ['l1', 'l2'] },
        { id: 't2', labels: [label('l1', 'gone', '2026-01-01')] },
        { id: 't3', labels: label('l1', 'gone', '2026-01-01') },
        { id: 't4', labels: ['l2'] },
      ],
      total: 4,
    });
    queryClient.setQueryData(taskKeys.detail.byId('t1'), { id: 't1', labels: ['l1'] });
    const untouched = queryClient.getQueryData<{ items: ItemData[] }>(flatKey)?.items[3];

    propagateEmbeddedProduct(LABEL, ['l1'], 'remove');

    const after = queryClient.getQueryData<{ items: ItemData[]; total: number }>(flatKey);
    expect(after).toEqual({
      items: [
        { id: 't1', labels: ['l2'] },
        { id: 't2', labels: [] },
        { id: 't3', labels: null },
        { id: 't4', labels: ['l2'] },
      ],
      total: 4,
    });
    expect(after?.items[3]).toBe(untouched);
    expect(queryClient.getQueryData(taskKeys.detail.byId('t1'))).toEqual({ id: 't1', labels: [] });
  });

  it('keeps the data object of lists that reference none of the ids', () => {
    queryClient.setQueryData(flatKey, { items: [{ id: 't1', labels: ['l2'] }], total: 1 });
    queryClient.setQueryData(infiniteKey, {
      pages: [{ items: [{ id: 't2', labels: [label('l2', 'kept', '2026-01-01')] }], total: 1 }],
      pageParams: [{ page: 0, offset: 0 }],
    });
    const flat = queryClient.getQueryData(flatKey);
    const paged = queryClient.getQueryData(infiniteKey);

    propagateEmbeddedProduct(LABEL, ['l1'], 'remove');

    expect(queryClient.getQueryData(flatKey)).toBe(flat);
    expect(queryClient.getQueryData(infiniteKey)).toBe(paged);
  });
});
