import { QueryObserver } from '@tanstack/react-query';
import type { Attachment } from 'sdk';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { requiredAttachmentHome } from '~/modules/attachment/tests/attachment-home';
import { callHook, goOffline, goOnline, mutationsOf, queryClient, resetMutationHooks } from '~/query/tests/mutation-hooks-kit';

type Req = { path: Record<string, string | undefined>; body: Record<string, unknown> | Array<Record<string, unknown>> };
const { batchCreateAttachments, updateAttachment, batchDeleteAttachments, listAttachments } = vi.hoisted(() => ({
  batchCreateAttachments: vi.fn(async (_req: Req): Promise<{ data: unknown[]; rejectedIds: string[] }> => ({ data: [], rejectedIds: [] })),
  updateAttachment: vi.fn(async (_req: Req): Promise<unknown> => ({})),
  batchDeleteAttachments: vi.fn(async (_req: Req): Promise<unknown> => ({ data: [], rejectedIds: [] })),
  listAttachments: vi.fn(async (_req: unknown): Promise<unknown> => ({ results: [], totalSize: 0 })),
}));

vi.mock('sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sdk')>()),
  batchCreateAttachments,
  updateAttachment,
  batchDeleteAttachments,
  listAttachments,
}));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { info: vi.fn(), error: vi.fn() } }));

const { attachmentQueryKeys, attachmentsCanonicalOptions, useAttachmentCreateMutation, useAttachmentDeleteMutation, useAttachmentUpdateMutation } =
  await import('~/modules/attachment/query');
const { fetchRangeAndPatch } = await import('~/query/realtime/cache-ops');
const { handleStreamChange } = await import('~/query/realtime/stream-handler');
const { sourceId } = await import('~/query/offline/hlc');
const { userStore } = await import('~/modules/user/user-store');

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };
// The rows carry the channel ids the app requires, so they splice into the home list of the deepest: the organization's in the template.
const home = requiredAttachmentHome(ctx.organizationId);
const homeKey = attachmentQueryKeys.list.home(ctx.organizationId, home.homeChannelId);

/** A stored attachment of the organization; the fields the mutation callbacks read and those a create body requires, since the body is parsed before it is sent. */
const attachment = (id: string, overrides: Partial<Attachment> = {}) =>
  ({
    id,
    entityType: 'attachment',
    name: id,
    filename: `${id}.png`,
    contentType: 'image/png',
    size: 1024,
    keys: { original: `${id}.png` },
    ...ctx,
    ...home.columns,
    ...overrides,
  }) as Attachment;
const [att1, att2, att3] = ['01970000-0000-7000-8000-000000000001', '01970000-0000-7000-8000-000000000002', '01970000-0000-7000-8000-000000000003'];

const seedHomeList = (items: Attachment[] = []) => queryClient.setQueryData(homeKey, { results: items, totalSize: items.length });
const homeList = () => queryClient.getQueryData<{ results: Attachment[] }>(homeKey)?.results ?? [];
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
  batchCreateAttachments.mockImplementation(async ({ body }) => ({
    data: (body as Attachment[]).map((row) => attachment(row.id, row)),
    rejectedIds: [],
  }));
  updateAttachment.mockImplementation(async ({ path, body }) => attachment(String(path.attachmentId), (body as { ops: Partial<Attachment> }).ops));
};

afterEach(resetMutationHooks);

describe('an edit of a row whose create is queued offline', () => {
  it('sends a field the create body does not take, such as the description, as an update after the create', async () => {
    seedHomeList();
    goOffline(batchCreateAttachments, updateAttachment);
    const { create, update } = hooks();
    create.mutate([attachment(att1)] as never);
    await vi.waitFor(() => expect(queued('create')).toHaveLength(1));

    update.mutate({ id: att1, ops: { description: '[{"type":"paragraph"}]' } });

    // The create row stays as the create body reads it, and the edit waits behind it as a mutation of its own.
    const [queuedRow] = (queued('create')[0].state.variables as { data: Record<string, unknown>[] }).data;
    expect(queuedRow).not.toHaveProperty('description');
    await vi.waitFor(() => expect(mutationsOf('attachment', 'update')).toHaveLength(1));
    // The cache shows the edit while both wait.
    await vi.waitFor(() => expect(homeList()).toMatchObject([{ id: att1, description: '[{"type":"paragraph"}]' }]));

    const order: string[] = [];
    serverStores();
    batchCreateAttachments.mockImplementation(async ({ body }) => {
      order.push('create');
      return { data: (body as Attachment[]).map((row) => attachment(row.id, row)), rejectedIds: [] };
    });
    updateAttachment.mockImplementation(async ({ path, body }) => {
      order.push('update');
      return attachment(String(path.attachmentId), (body as { ops: Partial<Attachment> }).ops);
    });
    await goOnline();
    await settled('update');

    expect(order).toEqual(['create', 'update']);
    expect(updateAttachment.mock.lastCall?.[0]).toMatchObject({
      path: { attachmentId: att1 },
      body: { ops: { description: '[{"type":"paragraph"}]' } },
    });
    expect(homeList()).toMatchObject([{ id: att1, description: '[{"type":"paragraph"}]' }]);
  });
});

describe('a delete of a row whose create is queued offline', () => {
  it('cancels a create that never left the device, and sends the delete after a create that may have committed', async () => {
    seedHomeList([attachment(att1)]);
    goOffline(batchCreateAttachments, batchDeleteAttachments);
    const { create, remove } = hooks();
    // The first create runs and parks; the second waits behind it in the scope, unsent.
    create.mutate([attachment(att2)] as never);
    hooks().create.mutate([attachment(att3)] as never);
    await vi.waitFor(() => expect(queued('create')).toHaveLength(2));

    remove.mutate([attachment(att1), attachment(att2), attachment(att3)]);
    await vi.waitFor(() => expect(queued('delete')).toHaveLength(1));
    expect(mutationsOf('attachment', 'create').map(({ state }) => state.variables)).toMatchObject([{ data: [{ id: att2 }] }]);
    // The delete waits behind the create in the scope, after its optimistic removal.
    await vi.waitFor(() => expect(homeList()).toEqual([]));

    const order: string[] = [];
    batchCreateAttachments.mockImplementation(async ({ body }) => {
      order.push('create');
      return { data: (body as Attachment[]).map((row) => attachment(row.id, row)), rejectedIds: [] };
    });
    batchDeleteAttachments.mockImplementation(async () => {
      order.push('delete');
      return { data: [], rejectedIds: [] };
    });
    await goOnline();
    await settled('delete');

    expect(order).toEqual(['create', 'delete']);
    expect(batchCreateAttachments.mock.calls.flatMap(([{ body }]) => (body as Attachment[]).map(({ id }) => id))).not.toContain(att3);
    expect(batchDeleteAttachments.mock.lastCall?.[0]).toMatchObject({ body: { ids: [att1, att2] } });
    expect(homeList()).toEqual([]);
  });
});

describe('a remote change of a row with a pending mutation', () => {
  it('leaves a row deleted offline out of the list when catchup reads it, and sends the delete once online', async () => {
    seedHomeList([attachment(att1), attachment(att2)]);
    goOffline(batchDeleteAttachments);
    hooks().remove.mutate([attachment(att1)]);
    await vi.waitFor(() => expect(queued('delete')).toHaveLength(1));
    expect(homeList().map(({ id }) => id)).toEqual([att2]);

    // Catchup after a reconnect reads the row: the server still holds it, since the queued delete has not been sent.
    listAttachments.mockResolvedValue({ results: [attachment(att1, { name: 'Renamed elsewhere' })], totalSize: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);
    expect(homeList().map(({ id }) => id)).toEqual([att2]);

    batchDeleteAttachments.mockImplementation(async () => ({ data: [], rejectedIds: [] }));
    await goOnline();
    await settled('delete');

    expect(batchDeleteAttachments.mock.lastCall?.[0]).toMatchObject({ path: ctx, body: { ids: [att1] } });
    expect(homeList().map(({ id }) => id)).toEqual([att2]);
  });

  it('reads the list again after the server refuses a delete: the row put back missed what arrived while it was pending', async () => {
    // The home list, or a filtered key where attachments also live below the organization.
    const canonical = attachmentsCanonicalOptions(ctx);
    queryClient.setQueryData(canonical.queryKey, { results: [attachment(att1), attachment(att2)], totalSize: 2 });
    // A screen shows the list, so the read the refusal starts runs at once.
    onTestFinished(new QueryObserver(queryClient, canonical).subscribe(() => {}));
    goOffline(batchDeleteAttachments);
    hooks().remove.mutate([attachment(att1)]);
    await vi.waitFor(() => expect(queued('delete')).toHaveLength(1));

    // A rename from elsewhere arrives while the delete waits, and is kept from the cache.
    const renamed = attachment(att1, { name: 'Renamed elsewhere', deletedAt: null });
    listAttachments.mockResolvedValue({ results: [renamed], totalSize: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);

    batchDeleteAttachments.mockImplementation(async () => ({ data: [], rejectedIds: [att1] }));
    // The list read answers the stored rows, live ones only (`liveItems`).
    listAttachments.mockResolvedValue({ results: [renamed, attachment(att2, { deletedAt: null })], totalSize: 2 });
    await goOnline();
    await settled('delete');

    // The row put back is read again once the delete has settled, with the rename it missed.
    await vi.waitFor(() => expect(queryClient.getQueryState(canonical.queryKey)).toMatchObject({ isInvalidated: false, fetchStatus: 'idle' }));
    expect(queryClient.getQueryData(canonical.queryKey)?.results).toMatchObject([{ id: att1, name: 'Renamed elsewhere' }, { id: att2 }]);
  });

  // The settle took only the fields the edit changed, so the remote edit of another field was gone for good.
  it('shows a remote edit of another field, kept from the cache while an edit was queued, once that edit settles', async () => {
    seedHomeList([attachment(att1, { contentType: 'image/png' })]);
    goOffline(updateAttachment);
    hooks().update.mutate({ id: att1, ops: { name: 'Renamed offline' } });
    await vi.waitFor(() => expect(queued('update')).toHaveLength(1));

    listAttachments.mockResolvedValue({ results: [attachment(att1, { contentType: 'application/pdf' })], totalSize: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);
    expect(homeList()).toMatchObject([{ name: 'Renamed offline', contentType: 'image/png' }]);

    // The server stores the edit over the remote one and answers the stored row.
    updateAttachment.mockImplementation(async ({ body }) =>
      attachment(att1, { contentType: 'application/pdf', ...(body as { ops: Partial<Attachment> }).ops }),
    );
    await goOnline();
    await settled('update');

    expect(homeList()).toMatchObject([{ name: 'Renamed offline', contentType: 'application/pdf' }]);
  });

  it('keeps the optimistic row of a queued create when a range fetch names its id', async () => {
    seedHomeList();
    goOffline(batchCreateAttachments);
    hooks().create.mutate([attachment(att1, { name: 'Typed offline' })] as never);
    await vi.waitFor(() => expect(queued('create')).toHaveLength(1));

    listAttachments.mockResolvedValue({ results: [attachment(att1, { name: 'From the server' })], totalSize: 1 });
    await fetchRangeAndPatch('attachment', ctx.organizationId, ctx.tenantId, { afterSeq: 0, untilSeq: 2 }, attachmentQueryKeys);

    expect(homeList()).toMatchObject([{ id: att1, name: 'Typed offline' }]);
  });
});

describe('the echo of the tab’s own write', () => {
  // The echo wrote the stored stamps into the cached row, so the answer's derived columns read as unwritten and the stale ones stayed.
  it('takes the columns the server derived from a new description when the echo arrives before the answer', async () => {
    const elsewhere = { mutationId: 'm-0', sourceId: 'elsewhere', fieldTimestamps: { description: '100:0000:aaaaa' } };
    seedHomeList([attachment(att1, { description: 'old', keywords: 'old', stx: elsewhere })]);
    userStore.setState({ user: { id: 'user-a' } as never });
    onTestFinished(() => userStore.getState().reset());
    let answer = (_row: Attachment) => {};
    updateAttachment.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    hooks().update.mutate({ id: att1, ops: { description: 'new' } });
    await vi.waitFor(() => expect(updateAttachment).toHaveBeenCalledOnce());

    // The server stamps the description anew and derives the keywords from it; its change reaches the tab first.
    const stored = attachment(att1, {
      description: 'new',
      keywords: 'new',
      stx: { mutationId: 'm-1', sourceId, fieldTimestamps: { description: '200:0000:aaaaa' } },
    });
    handleStreamChange({
      action: 'update',
      productType: 'attachment',
      ...ctx,
      channelId: null,
      rows: [{ subjectId: att1, seq: 3, stx: stored.stx, actorId: 'user-a' }],
      overflow: null,
      spreadWindow: null,
      propagation: null,
    });
    answer(stored);
    await settled('update');

    expect(homeList()).toMatchObject([{ description: 'new', keywords: 'new' }]);
  });
});
