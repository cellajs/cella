import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachmentsDb } from '~/modules/attachment/offline/attachments-db';

vi.mock('shared', async () => ({ appConfig: (await import('~/modules/attachment/tests/test-setup')).mockAttachmentAppConfig }));

import { isUploadCandidate } from '~/modules/attachment/offline/is-upload-candidate';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { mockAttachmentAppConfig } from '~/modules/attachment/tests/test-setup';
import { bindLocalUserDb } from '~/query/local-user-db';

// Attachment tables live in the per-user localUserDb; bind one so `attachmentsDb` resolves.
bindLocalUserDb('test-user');

const id = 'att-1:raw';
const { uploadRetryAttempts } = mockAttachmentAppConfig.localBlobStorage;

const row = async () => {
  const blob = await attachmentsDb.blobs.get(id);
  if (!blob) throw new Error('blob row missing');
  return blob;
};

describe('a failed upload', () => {
  afterEach(() => attachmentsDb.blobs.clear());

  it('is retried once its backoff slot has passed, and stays failed past the attempt budget', async () => {
    await attachmentsDb.blobs.add({
      id,
      attachmentId: 'att-1',
      variant: 'raw',
      organizationId: 'org-1',
      blob: new Blob(['png']),
      size: 3,
      contentType: 'image/png',
      source: 'upload',
      uploadStatus: 'pending',
      uploadAttempts: 0,
      nextRetryAt: null,
      lastError: null,
      storedAt: new Date(),
    });

    await attachmentStorage.markFailed(id, 'first');
    const afterFirst = await row();
    expect(afterFirst.nextRetryAt).toBeInstanceOf(Date);
    const slot = new Date(afterFirst.nextRetryAt ?? 0).getTime();
    expect(isUploadCandidate(afterFirst, uploadRetryAttempts, slot - 1)).toBe(false);
    expect(isUploadCandidate(afterFirst, uploadRetryAttempts, slot)).toBe(true);

    await attachmentStorage.markFailed(id, 'second');
    await attachmentStorage.markFailed(id, 'third');
    const spent = await row();
    expect(spent.uploadAttempts).toBe(uploadRetryAttempts);
    expect(isUploadCandidate(spent, uploadRetryAttempts, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
