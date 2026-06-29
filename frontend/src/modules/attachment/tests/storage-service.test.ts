import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttachmentBlob, attachmentsDb, type DownloadQueueEntry } from '../dexie/attachments-db';

vi.mock('shared', async () => ({
  appConfig: (await import('./test-setup')).mockAttachmentAppConfig,
}));

import { attachmentStorage } from '../dexie/storage-service';

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

function makeQueueEntry(overrides: Partial<DownloadQueueEntry> = {}): DownloadQueueEntry {
  return {
    id: 'att-1',
    organizationId: 'org-1',
    priority: 1,
    status: 'pending',
    skipReason: null,
    queuedAt: new Date(),
    attempts: 0,
    ...overrides,
  };
}

describe('attachmentStorage.clearAll', () => {
  beforeEach(async () => {
    await attachmentsDb.blobs.clear();
    await attachmentsDb.downloadQueue.clear();
  });

  afterEach(async () => {
    await attachmentsDb.blobs.clear();
    await attachmentsDb.downloadQueue.clear();
  });

  it('removes all blobs', async () => {
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-1:original', attachmentId: 'att-1' }));
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-2:thumbnail', attachmentId: 'att-2', variant: 'thumbnail' }));

    await attachmentStorage.clearAll();

    const count = await attachmentsDb.blobs.count();
    expect(count).toBe(0);
  });

  it('removes all download queue entries', async () => {
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1' }));
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-2' }));

    await attachmentStorage.clearAll();

    const count = await attachmentsDb.downloadQueue.count();
    expect(count).toBe(0);
  });

  it('works when tables are already empty', async () => {
    await attachmentStorage.clearAll();

    const blobCount = await attachmentsDb.blobs.count();
    const queueCount = await attachmentsDb.downloadQueue.count();
    expect(blobCount).toBe(0);
    expect(queueCount).toBe(0);
  });

  it('clears blobs from multiple organizations', async () => {
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-1:original', organizationId: 'org-1' }));
    await attachmentsDb.blobs.add(makeBlob({ id: 'att-2:original', attachmentId: 'att-2', organizationId: 'org-2' }));
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', organizationId: 'org-1' }));
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-2', organizationId: 'org-2' }));

    await attachmentStorage.clearAll();

    expect(await attachmentsDb.blobs.count()).toBe(0);
    expect(await attachmentsDb.downloadQueue.count()).toBe(0);
  });
});

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
    // Other variants must not match — this is the bug `hasAnyVariant === variant` had.
    expect(await attachmentStorage.hasVariant('att-1', 'thumbnail')).toBe(false);
    expect(await attachmentStorage.hasVariant('att-1', 'converted')).toBe(false);
    expect(await attachmentStorage.hasVariant('att-1', 'raw')).toBe(false);
  });

  it('returns false for unknown attachments', async () => {
    expect(await attachmentStorage.hasVariant('does-not-exist', 'original')).toBe(false);
  });
});
