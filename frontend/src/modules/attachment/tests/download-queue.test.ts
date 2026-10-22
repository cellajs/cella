import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentsDb } from '../offline/attachments-db';

vi.mock('shared', async () => ({ appConfig: (await import('./test-setup')).mockAttachmentAppConfig }));
vi.mock('../offline/storage-service', () => ({ attachmentStorage: { getStoredVariants: vi.fn().mockResolvedValue([]) } }));

import { bindLocalUserDb } from '~/query/local-user-db';
import { downloadQueue } from '../offline/download-queue';
import { makeAttachment, makeQueueEntry } from './test-setup';

// Attachment tables live in the per-user localUserDb; bind one so `attachmentsDb` resolves.
bindLocalUserDb('test-user');

describe('downloadQueue.enqueue', () => {
  beforeEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await attachmentsDb.downloadQueue.clear();
  });

  it('overlapping enqueues of the same attachments add each row once without failing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await Promise.all([
      downloadQueue.enqueue([makeAttachment()], 'org-1'),
      downloadQueue.enqueue([makeAttachment(), makeAttachment({ id: 'att-2' })], 'org-1'),
    ]);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(await attachmentsDb.downloadQueue.count()).toBe(2);
    expect((await attachmentsDb.downloadQueue.get('att-2'))?.status).toBe('pending');
    errorSpy.mockRestore();
  });

  it('re-queues a failed download each time its attachment is seen again, until the attempt cap', async () => {
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'failed', attempts: 2 }));
    await downloadQueue.enqueue([makeAttachment({ id: 'att-1' })], 'org-1');
    // Attempts are kept, so the cap still bites on the next failure.
    expect(await attachmentsDb.downloadQueue.get('att-1')).toMatchObject({ status: 'pending', attempts: 2 });

    await attachmentsDb.downloadQueue.put(makeQueueEntry({ id: 'att-1', status: 'failed', attempts: 3 }));
    await downloadQueue.enqueue([makeAttachment({ id: 'att-1' })], 'org-1');
    expect((await attachmentsDb.downloadQueue.get('att-1'))?.status).toBe('failed');
  });
});
