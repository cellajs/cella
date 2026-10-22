import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { callHook, mutationsOf, resetMutationHooks } from '~/query/tests/mutation-hooks-kit';

const { deleteAttachments } = vi.hoisted(() => ({
  deleteAttachments: vi.fn(async (): Promise<{ rejectedIds: string[] }> => ({ rejectedIds: [] })),
}));

vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), deleteAttachments }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { info: vi.fn(), error: vi.fn() } }));
// The owner listener lives with the database; the per-user stores behind the storage module are not under test.
vi.mock('~/query/local-user-storage', () => ({ subscribeOwnerChange: () => () => {} }));

const { bindLocalUserDb } = await import('~/query/local-user-db');
const { attachmentsDb } = await import('~/modules/attachment/offline/attachments-db');
const { downloadService } = await import('~/modules/attachment/offline/download-service');
const { useAttachmentDeleteMutation } = await import('~/modules/attachment/query');
const { makeAttachment, makeQueueEntry } = await import('~/modules/attachment/tests/test-setup');

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };

describe('download service', () => {
  beforeAll(() => {
    bindLocalUserDb('test-user');
    downloadService.start();
  });

  afterAll(() => downloadService.stop());

  afterEach(async () => {
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
    expect(deleteAttachments).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ ids: ['att-1'] }) }));
  });

  // The provider starts the service before the persisted cache is restored; a row claimed then would stay `downloading` for good.
  it('leaves a queued row pending, with no attempt spent, while its attachment is not in the cache yet', async () => {
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-2', status: 'pending' }));

    await downloadService.processQueue();

    expect(await attachmentsDb.downloadQueue.get('att-2')).toMatchObject({ status: 'pending', attempts: 0 });
  });
});
