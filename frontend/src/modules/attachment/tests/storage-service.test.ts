import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttachmentBlob, attachmentsDb } from '../offline/attachments-db';

vi.mock('shared', async () => ({
  appConfig: (await import('./test-setup')).mockAttachmentAppConfig,
}));

import { bindAppDb } from '~/query/app-db';
import { attachmentStorage } from '../offline/storage-service';

// Attachment tables live in the per-user appdb; bind one so `attachmentsDb` resolves.
bindAppDb('test-user');

function makeBlob(overrides: Partial<AttachmentBlob> = {}): AttachmentBlob {
  return {
    id: 'att-1:original',
    attachmentId: 'att-1',
    variant: 'original',
    organizationId: 'org-1',
    blob: new Blob(['test']),
    size: 4,
    contentType: 'image/png',
    source: 'download',
    uploadStatus: 'uploaded',
    storedAt: new Date(),
    ...overrides,
  };
}

describe('attachmentStorage.hasVariant', () => {
  beforeEach(async () => {
    await attachmentsDb.blobs.clear();
  });

  afterEach(async () => {
    await attachmentsDb.blobs.clear();
  });

  it('returns true only for the exact variant stored', async () => {
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-1:original', variant: 'original' }));

    expect(await attachmentStorage.hasVariant('att-1', 'original')).toBe(true);
    // Other variants must not match this requested variant.
    expect(await attachmentStorage.hasVariant('att-1', 'thumbnail')).toBe(false);
    expect(await attachmentStorage.hasVariant('att-1', 'converted')).toBe(false);
    expect(await attachmentStorage.hasVariant('att-1', 'raw')).toBe(false);
  });

  it('returns false for unknown attachments', async () => {
    expect(await attachmentStorage.hasVariant('does-not-exist', 'original')).toBe(false);
  });
});

describe('attachmentStorage.updateUploadStatus failure bookkeeping', () => {
  beforeEach(async () => {
    await attachmentsDb.blobs.clear();
  });

  afterEach(async () => {
    await attachmentsDb.blobs.clear();
  });

  it('bumps attempts and schedules the retry slot even WITHOUT an error message', async () => {
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-2:original', uploadStatus: 'uploading', uploadAttempts: 0 }));

    // The service's catch-path historically called this without an error argument; the
    // bookkeeping the retry selector reads must still be written.
    await attachmentStorage.updateUploadStatus('att-2:original', 'failed');

    const blob = await attachmentsDb.blobs.get('att-2:original');
    expect(blob?.uploadStatus).toBe('failed');
    expect(blob?.uploadAttempts).toBe(1);
    expect(blob?.nextRetryAt).toBeInstanceOf(Date);
    expect(blob?.lastError).toBeTruthy();
  });

  it('accumulates attempts across consecutive failures with growing backoff', async () => {
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-3:original', uploadStatus: 'pending', uploadAttempts: 0 }));

    await attachmentStorage.markFailed('att-3:original', 'first');
    const afterFirst = await attachmentsDb.blobs.get('att-3:original');
    await attachmentStorage.markFailed('att-3:original', 'second');
    const afterSecond = await attachmentsDb.blobs.get('att-3:original');

    expect(afterFirst?.uploadAttempts).toBe(1);
    expect(afterSecond?.uploadAttempts).toBe(2);
    expect(afterSecond?.lastError).toBe('second');
    if (!afterFirst?.nextRetryAt || !afterSecond?.nextRetryAt) throw new Error('nextRetryAt was not written');
    expect(new Date(afterSecond.nextRetryAt).getTime()).toBeGreaterThan(new Date(afterFirst.nextRetryAt).getTime());
  });
});
