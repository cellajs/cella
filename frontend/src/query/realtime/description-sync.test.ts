import type { EntityType, ProductEntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// Synthetic hierarchy as in cache-ops.test.ts: 'task' is a product homed at the `project` channel.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .build();
  return {
    ...actual,
    appConfig: {
      channelEntityTypes: hierarchy.channelTypes,
      entityIdColumnKeys: hierarchy.idColumnKeys,
    },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

stubLocalStorage();

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { registerYjsOwnedFields } = await import('~/modules/common/blocknote/yjs-owned-fields');
const { patchCollaborativeDescription } = await import('~/modules/common/blocknote/description-updater');
const { fetchEntityAndUpdateList, fetchRangeAndPatch } = await import('~/query/realtime/cache-ops');

// The synthetic 'task' type exists only in this file's shared mock, hence the casts.
const task = 'task' as EntityType;
const taskProduct = 'task' as ProductEntityType;

type TaskRow = {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  description: string | null;
  keywords?: string;
  stx: { mutationId: string; sourceId: string; fieldTimestamps: Record<string, string> };
};

const keys = createEntityKeys<{ q?: string }>(task);
const detailKey = keys.detail.byId('task-1');
const homeKey = keys.list.home('org-1', 'project-1');
const filteredKey = [...keys.list.org('org-1'), { q: '' }];

const row = (description: string | null, overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: 'task-1',
  organizationId: 'org-1',
  projectId: 'project-1',
  name: 'Task',
  description,
  stx: { mutationId: 'm-1', sourceId: 'other-tab', fieldTimestamps: { description: 'T1' } },
  ...overrides,
});

/** The stx of a server write with these field timestamps. */
const written = (fieldTimestamps: Record<string, string>) => ({ mutationId: 'm-2', sourceId: 'other-tab', fieldTimestamps });

const listOf = (item: TaskRow) => ({ items: [item], total: 1 });
const detail = () => queryClient.getQueryData<TaskRow>(detailKey);
const homeRow = () => queryClient.getQueryData<{ items: TaskRow[] }>(homeKey)?.items[0];
const filteredRow = () => queryClient.getQueryData<{ items: TaskRow[] }>(filteredKey)?.items[0];

/** The range fetch answers with these rows: the seq path of a stream notification or a catchup gap. */
function serverReturns(...items: TaskRow[]) {
  registerEntityQueryKeys(task, keys, async () => ({ items, total: items.length }));
}

function seedCaches(item: TaskRow, { withDetail = true } = {}) {
  if (withDetail) queryClient.setQueryData(detailKey, item);
  queryClient.setQueryData(homeKey, listOf(item));
  queryClient.setQueryData(filteredKey, listOf(item));
}

/** A mutation for the row still in flight, as TanStack holds it until it settles. */
function buildPendingUpdate(id: string) {
  queryClient.getMutationCache().build(
    queryClient,
    { mutationKey: [task, 'update'], mutationFn: async () => null },
    {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'pending',
      variables: { id },
      submittedAt: Date.now(),
    },
  );
}

afterEach(() => {
  registerYjsOwnedFields(taskProduct, ['description']);
  queryClient.clear();
});

describe('a remote change of a row with a pending mutation', () => {
  it('stays out of every cache until the mutation settles, from a range read and a single-row read alike', async () => {
    seedCaches(row('optimistic'));
    buildPendingUpdate('task-1');
    const server = row('server', { stx: written({ description: 'T2' }) });
    serverReturns(server);
    // The single-row read writes the detail itself, so it must not run at all.
    queryClient.setQueryDefaults(keys.detail.base, { queryFn: async () => server });

    const { status } = await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 4, untilSeq: 5 }, keys);
    await fetchEntityAndUpdateList(taskProduct, 'task-1', keys, 'update', 'org-1', 'tenant-1');

    expect(status).toBe('ok');
    for (const cached of [detail(), homeRow(), filteredRow()]) expect(cached?.description).toBe('optimistic');
  });
});

describe('Yjs-owned fields on a server row', () => {
  // The relay has not saved yet: the server row holds the older body under the seeded row's stamp.
  const staleRead = () => row('older');
  const patch = () => patchCollaborativeDescription(taskProduct, row('older'), 'newer');

  it.each([
    { read: 'range', cached: 'detail and lists', patched: 'before' },
    { read: 'range', cached: 'lists', patched: 'before' },
    { read: 'single-row', cached: 'detail and lists', patched: 'during' },
    { read: 'single-row', cached: 'detail', patched: 'before' },
  ] as const)(
    'keeps a collaborative patch in every cached copy over a read that lags the relay: $read read, $cached cached, patched $patched the fetch',
    async ({ read, cached, patched }) => {
      if (cached !== 'lists') queryClient.setQueryData(detailKey, row('older'));
      if (cached !== 'detail') {
        queryClient.setQueryData(homeKey, listOf(row('older')));
        queryClient.setQueryData(filteredKey, listOf(row('older')));
      }
      if (patched === 'before') patch();

      if (read === 'range') {
        serverReturns(staleRead());
        await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 4, untilSeq: 5 }, keys);
      } else {
        queryClient.setQueryDefaults(keys.detail.base, {
          queryFn: async () => {
            if (patched === 'during') patch();
            return staleRead();
          },
        });
        await fetchEntityAndUpdateList(taskProduct, 'task-1', keys, 'update', 'org-1', 'tenant-1');
      }

      const copies = [detail(), homeRow(), filteredRow()].filter((copy) => copy !== undefined);
      expect(copies).not.toHaveLength(0);
      for (const copy of copies) expect(copy.description).toBe('newer');
    },
  );

  it('takes the description from a server write of it, which carries a new stamp', async () => {
    seedCaches(row('older'));
    patchCollaborativeDescription(taskProduct, row('older'), 'newer');
    serverReturns(row('saved', { stx: written({ description: 'T2' }) }));

    await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 4, untilSeq: 5 }, keys);

    for (const cached of [detail(), homeRow(), filteredRow()]) {
      expect(cached).toMatchObject({ description: 'saved', stx: { fieldTimestamps: { description: 'T2' } } });
    }
  });

  it('keeps a patch on a row never edited since its create when another field is written meanwhile', async () => {
    seedCaches(row('created', { stx: written({}) }));
    patchCollaborativeDescription(taskProduct, row('created', { stx: written({}) }), 'edited');
    // Another user's write of a different field: the stale row stamps that field alone.
    serverReturns(row('created', { name: 'Reordered', stx: written({ name: 'T5' }) }));

    await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 4, untilSeq: 5 }, keys);

    expect(detail()).toMatchObject({ description: 'edited', name: 'Reordered' });
    expect(homeRow()).toMatchObject({ description: 'edited', name: 'Reordered' });
  });

  it('applies an incoming row that carries no stx at all', async () => {
    seedCaches(row('local', { stx: written({}) }));
    const { stx: _stx, ...withoutStx } = row('server');
    serverReturns(withoutStx as TaskRow);

    await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 4, untilSeq: 5 }, keys);

    expect(detail()?.description).toBe('server');
    expect(homeRow()?.description).toBe('server');
  });

  it('guards a derived field by the description stamp', async () => {
    registerYjsOwnedFields(taskProduct, ['description', 'keywords']);
    seedCaches(row('patched', { keywords: 'patched words' }));
    serverReturns(row('older', { keywords: 'older words' }));

    await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 4, untilSeq: 5 }, keys);
    expect(homeRow()).toMatchObject({ description: 'patched', keywords: 'patched words' });

    serverReturns(row('saved', { keywords: 'saved words', stx: written({ description: 'T2' }) }));
    await fetchRangeAndPatch(task, 'org-1', 'tenant-1', { afterSeq: 5, untilSeq: 6 }, keys);
    expect(homeRow()).toMatchObject({ description: 'saved', keywords: 'saved words' });
    expect(detail()).toMatchObject({ description: 'saved', keywords: 'saved words' });
  });
});
