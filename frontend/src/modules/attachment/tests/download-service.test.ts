import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { callHook, mutationsOf, resetMutationHooks } from '~/query/tests/mutation-hooks-kit';

const { batchDeleteAttachments } = vi.hoisted(() => ({
  batchDeleteAttachments: vi.fn(async (): Promise<{ rejectedIds: string[] }> => ({ rejectedIds: [] })),
}));

vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), batchDeleteAttachments }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { info: vi.fn(), error: vi.fn() } }));
// The content-type filters the tier cases assert, whatever an app configures.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const localBlobStorage = { ...actual.appConfig.localBlobStorage, allowedContentTypes: [], excludedContentTypes: ['video/*'] };
  return { ...actual, appConfig: { ...actual.appConfig, localBlobStorage } };
});
vi.mock('~/modules/attachment/presign-batch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/modules/attachment/presign-batch')>()),
  getPresignedUrlBatched: vi.fn(async (id: string, variant: string) => `https://storage.test/${id}/${variant}`),
}));
const { bindLocalUserDb } = await import('~/query/local-user-db');
const { attachmentsDb } = await import('~/modules/attachment/offline/attachments-db');
const { downloadService } = await import('~/modules/attachment/offline/download-service');
const { offlineFilesStore } = await import('~/modules/attachment/offline/offline-files-store');
const { attachmentQueryKeys, useAttachmentDeleteMutation } = await import('~/modules/attachment/query');
const { queryClient } = await import('~/query/query-client');
const { makeAttachment, makeQueueEntry } = await import('~/modules/attachment/tests/test-setup');
const { publishChangeEvent } = await import('~/query/realtime/sync-events');

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };

const storedKeys = (id: string) => ({ original: `org-1/u/${id}.png`, preview: `org-1/u/${id}-preview.png`, thumbnail: `org-1/u/${id}-thumb.png` });
const cachedRow = (id: string, overrides: Record<string, unknown> = {}) =>
  makeAttachment({ id, ...ctx, createdAt: '2026-11-01T00:00:00.000Z', keys: storedKeys(id), ...overrides });
/** Writes the organization's list, as sync or a key link does. */
const cacheRows = (...rows: ReturnType<typeof cachedRow>[]) =>
  queryClient.setQueryData(attachmentQueryKeys.list.home(ctx.organizationId), { items: rows, total: rows.length });
const storedVariants = async (id: string) =>
  (await attachmentsDb.blobs.where('attachmentId').equals(id).toArray()).map((blob) => blob.variant).sort();
const statusOf = async (id: string) => (await attachmentsDb.downloadQueue.get(id))?.status;

describe('download service', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['bytes']) })),
    );
    bindLocalUserDb('test-user');
    downloadService.start();
  });

  afterAll(() => {
    downloadService.stop();
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    queryClient.removeQueries({ queryKey: attachmentQueryKeys.list.base });
    await attachmentsDb.downloadQueue.clear();
    await attachmentsDb.blobs.clear();
    resetMutationHooks();
  });

  it("removes a deleted attachment's stored file and queue row from the device", async () => {
    await attachmentsDb.blobs.add({
      id: 'att-1:original',
      attachmentId: 'att-1',
      variant: 'original',
      organizationId: ctx.organizationId,
      blob: new Blob(['test']),
      size: 4,
      contentType: 'image/png',
      source: 'download',
      uploadStatus: 'uploaded',
      storedAt: new Date(),
    });
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'downloaded' }));

    callHook(() => useAttachmentDeleteMutation(ctx.tenantId, ctx.organizationId)).mutate([makeAttachment({ id: 'att-1', ...ctx })]);
    await vi.waitFor(() => expect(mutationsOf('attachment', 'delete')[0]?.state.status).toBe('success'));

    await vi.waitFor(async () => {
      expect(await attachmentsDb.blobs.where('attachmentId').equals('att-1').count()).toBe(0);
      expect(await attachmentsDb.downloadQueue.get('att-1')).toBeUndefined();
    });
    expect(batchDeleteAttachments).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ ids: ['att-1'] }) }));
  });

  it("removes the stored file of an attachment a move took out of this reader's reach", async () => {
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-2', status: 'downloaded' }));

    publishChangeEvent({ action: 'moveOut', entityType: 'attachment', organizationId: ctx.organizationId, channelId: null, subjectId: 'att-2' });

    await vi.waitFor(async () => expect(await attachmentsDb.downloadQueue.get('att-2')).toBeUndefined());
  });

  // A row queued with its local key finishes on the previews tier with nothing stored, and a finished row never revives once linked.
  it("queues an offline upload once its keys link, and caches that file's previews", async () => {
    offlineFilesStore.setState({ tier: 'previews' });
    const upload = cachedRow('att-upload', { keys: { original: 'blob:http://localhost:3000/0f8c1a52-7e3b-4c9d-9a1e-2b6f4d8c0e17' } });

    cacheRows(upload);
    await downloadService.queueForDownload([upload]);
    expect(await attachmentsDb.downloadQueue.get('att-upload')).toBeUndefined();

    cacheRows({ ...upload, keys: storedKeys('att-upload') });
    await vi.waitFor(async () => expect(await statusOf('att-upload')).toBe('downloaded'));
    expect(await storedVariants('att-upload')).toEqual(['preview', 'thumbnail']);
  });

  it.each(['previews', 'recent'] as const)("keeps an excluded type's previews and never its file on the %s tier", async (tier) => {
    offlineFilesStore.setState({ tier });

    cacheRows(cachedRow('att-video', { contentType: 'video/mp4' }));

    await vi.waitFor(async () => expect(await statusOf('att-video')).toBe('downloaded'));
    expect(await storedVariants('att-video')).toEqual(['preview', 'thumbnail']);
  });

  // The user's tabs share one queue, each with its own cache, and the service starts before that cache is restored.
  it("leaves rows this tab's cache lacks for a tab that has them, and downloads the older rows behind them", async () => {
    offlineFilesStore.setState({ tier: 'previews' });
    await attachmentsDb.downloadQueue.bulkAdd([
      makeQueueEntry({ id: 'att-other-tab-1', priority: -3 }),
      makeQueueEntry({ id: 'att-other-tab-2', priority: -2 }),
      makeQueueEntry({ id: 'att-older', priority: -1 }),
    ]);

    cacheRows(cachedRow('att-older'));

    await vi.waitFor(async () => expect(await statusOf('att-older')).toBe('downloaded'));
    expect(await attachmentsDb.downloadQueue.bulkGet(['att-other-tab-1', 'att-other-tab-2'])).toMatchObject([
      { status: 'pending', attempts: 0 },
      { status: 'pending', attempts: 0 },
    ]);
  });
});
