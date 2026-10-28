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
const { propagateEmbeddedProduct } = await import('~/query/realtime/propagation');

// The synthetic 'label' and 'task' types exist only in this file's shared mock, hence the casts.
const labelType = 'label' as ProductEntityType;
const org = 'org-1';
const project = 'project-1';

const labelKeys = createEntityKeys<Record<string, never>>(labelType);

describe('propagateEmbeddedProduct', () => {
  const taskType = 'task' as ProductEntityType;
  const taskKeys = createEntityKeys<Record<string, never>>(taskType);
  const infiniteKey = [...taskKeys.list.org(org), { q: '' }];
  const flatKey = taskKeys.list.home(org, project);

  const label = (id: string, name: string, updatedAt: string) => ({ id, name, updatedAt });

  beforeEach(() => {
    registerEntityQueryKeys(taskType, taskKeys, async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys(labelType, labelKeys, async () => ({ items: [], total: 0 }));
  });
  afterEach(() => queryClient.clear());

  it('replaces an embedded copy only with a strictly newer row', () => {
    queryClient.setQueryData(labelKeys.detail.byId('l1'), label('l1', 'new', '2026-02-01'));
    queryClient.setQueryData(labelKeys.detail.byId('l2'), label('l2', 'fresh', '2026-01-01'));
    queryClient.setQueryData(infiniteKey, {
      pages: [{ items: [{ id: 't1', labels: [label('l1', 'old', '2026-01-01'), label('l2', 'local edit', '2026-01-01')] }], total: 1 }],
      pageParams: [{ page: 0, offset: 0 }],
    });

    propagateEmbeddedProduct(labelType, ['l1', 'l2'], 'update');

    // A copy as new as the fresh row may carry a concurrent edit, so it stays.
    const after = queryClient.getQueryData<{ pages: { items: ItemData[] }[] }>(infiniteKey);
    expect(after?.pages[0].items[0]).toEqual({ id: 't1', labels: [label('l1', 'new', '2026-02-01'), label('l2', 'local edit', '2026-01-01')] });
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

    propagateEmbeddedProduct(labelType, ['l1'], 'remove');

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
});
