import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttachmentBlob, attachmentsDb } from '../dexie/attachments-db';

vi.mock('shared', async () => ({
  appConfig: (await import('./test-setup')).mockAttachmentAppConfig,
}));

import { bindAppDb } from '~/query/app-db';
import { attachmentStorage } from '../dexie/storage-service';

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
