import type { ProductEntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemData } from '~/query/basic/types';

// Synthetic app: 'label' is a product embedded on the 'task' product, both homed at 'project'.
// Base cella configures no embeddings, so the relationship only exists in this file's mock.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .channel('organization', { parent: null, roles: roles.all })
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

vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { collectEmbeddingTouches, invalidateEmbeddedForHost, invalidateEmbeddedUsage } = await import('./propagation');
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
      collectEmbeddingTouches(
        'task',
        row({ id: 't1', labels: ['a', 'b'] }),
        row({ id: 't1', labels: ['b', 'c'] }),
        touches,
      );
      expect([...(touches.get(LABEL) ?? [])].sort()).toEqual(['a', 'c']);
    });

    it('ignores an edit that leaves the embedding column alone', () => {
      const touches: EmbeddingTouches = new Map();
      collectEmbeddingTouches(
        'task',
        row({ id: 't1', labels: ['a'], name: 'before' }),
        row({ id: 't1', labels: ['a'], name: 'after' }),
        touches,
      );
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
