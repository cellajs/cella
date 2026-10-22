import { hydrate } from '@tanstack/react-query';
import type { Attachment } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callHook, goOffline, goOnline, mutationsOf, queryClient, resetMutationHooks } from '~/query/tests/mutation-hooks-kit';

type Req = { path: Record<string, string | undefined>; body: Record<string, unknown> | Array<Record<string, unknown>> };
const { createAttachments, updateAttachment, deleteAttachments, getAttachments } = vi.hoisted(() => ({
  createAttachments: vi.fn(async (_req: Req): Promise<{ data: unknown[]; rejectedIds: string[] }> => ({ data: [], rejectedIds: [] })),
  updateAttachment: vi.fn(async (_req: Req): Promise<unknown> => ({})),
  deleteAttachments: vi.fn(async (_req: Req): Promise<unknown> => ({ data: [], rejectedIds: [] })),
  getAttachments: vi.fn(async (_req: unknown): Promise<unknown> => ({ items: [], total: 0 })),
}));

vi.mock('sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sdk')>()),
  createAttachments,
  updateAttachment,
  deleteAttachments,
  getAttachments,
}));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { info: vi.fn(), error: vi.fn() } }));

const { attachmentQueryKeys, useAttachmentCreateMutation, useAttachmentDeleteMutation, useAttachmentUpdateMutation } = await import(
  '~/modules/attachment/query'
);
const { initMutationDefaults } = await import('~/query/mutation-registry');
const { upgradePersistedMutation } = await import('~/query/offline/mutation-variables');
const { fetchRangeAndPatch } = await import('~/query/realtime/cache-ops');

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };
// The rows here carry no channel id, so they splice into the organization's home list.
const homeKey = attachmentQueryKeys.list.home(ctx.organizationId);

/** A stored attachment of the organization; only the fields the mutation callbacks read. */
const attachment = (id: string, overrides: Partial<Attachment> = {}) =>
  ({ id, entityType: 'attachment', name: id, filename: `${id}.png`, ...ctx, ...overrides }) as Attachment;

const seedHomeList = (items: Attachment[] = []) => queryClient.setQueryData(homeKey, { items, total: items.length });
const homeList = () => queryClient.getQueryData<{ items: Attachment[] }>(homeKey)?.items ?? [];
const queued = (operation: 'create' | 'update' | 'delete') => mutationsOf('attachment', operation).filter(({ state }) => state.isPaused);
const settled = async (operation: 'create' | 'update' | 'delete') =>
  vi.waitFor(() => expect(mutationsOf('attachment', operation).every(({ state }) => state.status === 'success')).toBe(true));

const hooks = () => ({
  create: callHook(() => useAttachmentCreateMutation(ctx.tenantId, ctx.organizationId)),
  update: callHook(() => useAttachmentUpdateMutation(ctx.tenantId, ctx.organizationId)),
  remove: callHook(() => useAttachmentDeleteMutation(ctx.tenantId, ctx.organizationId)),
});

/** The server stores what a create sends and answers an update with the changed row. */
const serverStores = () => {
  createAttachments.mockImplementation(async ({ body }) => ({ data: (body as Attachment[]).map((row) => attachment(row.id, row)), rejectedIds: [] }));
  updateAttachment.mockImplementation(async ({ path, body }) => attachment(String(path.id), (body as { ops: Partial<Attachment> }).ops));
};

afterEach(resetMutationHooks);

describe('an edit of a row whose create is queued offline', () => {
  it('sends a field the create body does not take, such as the description, as an update after the create', async () => {
    seedHomeList();
    goOffline(createAttachments, updateAttachment);
    const { create, update } = hooks();
    create.mutate([attachment('att-1')] as never);
    await vi.waitFor(() => expect(queued('create')).toHaveLength(1));

    update.mutate({ id: 'att-1', ops: { description: '[{"type":"paragraph"}]' } });

    // The create row stays as the create body reads it, and the edit waits behind it as a mutation of its own.
    const [queuedRow] = (queued('create')[0].state.variables as { data: Record<string, unknown>[] }).data;
    expect(queuedRow).not.toHaveProperty('description');
    await vi.waitFor(() => expect(mutationsOf('attachment', 'update')).toHaveLength(1));
    // The cache shows the edit while both wait.
    await vi.waitFor(() => expect(homeList()).toMatchObject([{ id: 'att-1', description: '[{"type":"paragraph"}]' }]));

    const order: string[] = [];
    serverStores();
    createAttachments.mockImplementation(async ({ body }) => {
      order.push('create');
      return { data: (body as Attachment[]).map((row) => attachment(row.id, row)), rejectedIds: [] };
    });
    updateAttachment.mockImplementation(async ({ path, body }) => {
      order.push('update');
      return attachment(String(path.id), (body as { ops: Partial<Attachment> }).ops);
    });
    await goOnline();
    await settled('update');

    expect(order).toEqual(['create', 'update']);
    expect(updateAttachment.mock.lastCall?.[0]).toMatchObject({ path: { id: 'att-1' }, body: { ops: { description: '[{"type":"paragraph"}]' } } });
    expect(homeList()).toMatchObject([{ id: 'att-1', description: '[{"type":"paragraph"}]' }]);
  });
});

describe('a delete of a row whose create is queued offline', () => {
  it('cancels the create and sends only the rows the server holds', async () => {
    seedHomeList([attachment('att-1')]);
    goOffline(createAttachments, deleteAttachments);
    const { create, remove } = hooks();
    create.mutate([attachment('att-2')] as never);
    await vi.waitFor(() => expect(queued('create')).toHaveLength(1));
    const createCalls = createAttachments.mock.calls.length;

    remove.mutate([attachment('att-1'), attachment('att-2')]);
    await vi.waitFor(() => expect(queued('delete')).toHaveLength(1));
    expect(mutationsOf('attachment', 'create')).toHaveLength(0);
    expect(homeList()).toEqual([]);

    deleteAttachments.mockImplementation(async () => ({ data: [], rejectedIds: [] }));
    await goOnline();
    await settled('delete');

    expect(createAttachments).toHaveBeenCalledTimes(createCalls);
    expect(deleteAttachments.mock.lastCall?.[0]).toMatchObject({ body: { ids: ['att-1'] } });
  });
});

describe('a remote change of a row with a pending mutation', () => {
  it('leaves a row deleted offline out of the list when catchup reads it, and sends the delete once online', async () => {
    seedHomeList([attachment('att-1'), attachment('att-2')]);
    goOffline(deleteAttachments);
    hooks().remove.mutate([attachment('att-1')]);
    await vi.waitFor(() => expect(queued('delete')).toHaveLength(1));
    expect(homeList().map(({ id }) => id)).toEqual(['att-2']);

    // Catchup after a reconnect reads the row: the server still holds it, since the queued delete has not been sent.
    getAttachments.mockResolvedValue({ items: [attachment('att-1', { name: 'Renamed elsewhere' })], total: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);
    expect(homeList().map(({ id }) => id)).toEqual(['att-2']);

    deleteAttachments.mockImplementation(async () => ({ data: [], rejectedIds: [] }));
    await goOnline();
    await settled('delete');

    expect(deleteAttachments.mock.lastCall?.[0]).toMatchObject({ path: ctx, body: { ids: ['att-1'] } });
    expect(homeList().map(({ id }) => id)).toEqual(['att-2']);
  });

  it('reads the list again after the server refuses a delete: the row put back missed what arrived while it was pending', async () => {
    seedHomeList([attachment('att-1'), attachment('att-2')]);
    goOffline(deleteAttachments);
    hooks().remove.mutate([attachment('att-1')]);
    await vi.waitFor(() => expect(queued('delete')).toHaveLength(1));

    // A rename from elsewhere arrives while the delete waits, and is kept from the cache.
    getAttachments.mockResolvedValue({ items: [attachment('att-1', { name: 'Renamed elsewhere' })], total: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);

    deleteAttachments.mockImplementation(async () => ({ data: [], rejectedIds: ['att-1'] }));
    await goOnline();
    await settled('delete');

    // The row is back as the delete held it, and the list is marked to be read from the server.
    expect(
      homeList()
        .map(({ id }) => id)
        .sort(),
    ).toEqual(['att-1', 'att-2']);
    expect(queryClient.getQueryState(homeKey)?.isInvalidated).toBe(true);
  });

  it('keeps the optimistic row of a queued create when a range fetch names its id', async () => {
    seedHomeList();
    goOffline(createAttachments);
    hooks().create.mutate([attachment('att-1', { name: 'Typed offline' })] as never);
    await vi.waitFor(() => expect(queued('create')).toHaveLength(1));

    getAttachments.mockResolvedValue({ items: [attachment('att-1', { name: 'From the server' })], total: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);

    expect(homeList()).toMatchObject([{ id: 'att-1', name: 'Typed offline' }]);
  });
});

describe('a delete an older bundle queued', () => {
  it('is replayed with its ids: the queue is restored in the shape this bundle reads', async () => {
    // What the older bundle left in the store: the rows under `attachments`, no version stamp.
    const stored = {
      mutationKey: ['attachment', 'delete'],
      scope: { id: 'attachment' },
      meta: { suppressGlobalErrorToast: true },
      state: {
        context: { deletedAttachments: [attachment('att-1')] },
        data: undefined,
        error: null,
        failureCount: 1,
        failureReason: null,
        isPaused: true,
        status: 'pending' as const,
        submittedAt: 100,
        variables: {
          ...ctx,
          attachments: [attachment('att-1'), attachment('att-2')],
          stx: { mutationId: 'mut-old', sourceId: 'tab', fieldTimestamps: {} },
        },
      },
    };

    const upgraded = upgradePersistedMutation(stored);
    expect(upgraded?.state.variables).toMatchObject({ rows: [{ id: 'att-1' }, { id: 'att-2' }] });

    // As the app does at startup, before the queue is restored: the module's mutation defaults are on the client.
    initMutationDefaults(queryClient);
    hydrate(queryClient, { queries: [], mutations: upgraded ? [upgraded] : [] });
    deleteAttachments.mockImplementation(async () => ({ data: [], rejectedIds: [] }));
    await queryClient.resumePausedMutations();
    await settled('delete');

    expect(deleteAttachments).toHaveBeenCalledTimes(1);
    expect(deleteAttachments.mock.lastCall?.[0]).toMatchObject({
      path: ctx,
      body: { ids: ['att-1', 'att-2'], stx: { mutationId: 'mut-old' } },
    });
  });
});
