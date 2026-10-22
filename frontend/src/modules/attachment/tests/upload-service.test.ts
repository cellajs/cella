import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttachmentBlob, attachmentsDb, makeBlobKey } from '~/modules/attachment/offline/attachments-db';

vi.mock('shared', async () => ({ appConfig: (await import('~/modules/attachment/tests/test-setup')).mockAttachmentAppConfig }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => true } }));

const getUploadToken = vi.fn();
const linkAttachmentKeys = vi.fn();
vi.mock('sdk', () => ({
  getUploadToken: (...args: unknown[]) => getUploadToken(...args),
  linkAttachmentKeys: (...args: unknown[]) => linkAttachmentKeys(...args),
}));

/** The assembly the fake Transloadit run completes with; the stored keys come from its results. */
let assemblyResults: Record<string, unknown[]> = {};
const addedFiles: { meta: Record<string, unknown> }[] = [];
vi.mock('@uppy/transloadit', () => ({ default: class {} }));
vi.mock('@uppy/core', () => ({
  Uppy: class {
    private handlers = new Map<string, (payload: unknown) => void>();
    use() {
      return this;
    }
    on(event: string, handler: (payload: unknown) => void) {
      this.handlers.set(event, handler);
      return this;
    }
    addFile(file: { meta: Record<string, unknown> }) {
      addedFiles.push(file);
    }
    async upload() {
      this.handlers.get('transloadit:complete')?.({ results: assemblyResults });
      return { successful: addedFiles.slice(-1) };
    }
    destroy() {}
  },
}));

const insertEntitiesIntoHome = vi.fn();
vi.mock('~/query/basic/apply-entity-to-lists', () => ({ insertEntitiesIntoHome: (...args: unknown[]) => insertEntitiesIntoHome(...args) }));
vi.mock('~/modules/attachment/query', () => ({ findAttachmentInCache: () => ({ tenantId: 'tenant-1' }) }));
vi.mock('~/query/query-client', () => ({ queryClient: {} }));
vi.mock('~/query/realtime/sync-priority', () => ({ getTenantIdForOrg: () => 'tenant-1' }));
vi.mock('~/lib/tracing', () => ({ reportCriticalError: vi.fn() }));
vi.mock('~/query/local-user-storage', () => ({ subscribeOwnerChange: () => () => {} }));

import { ApiError } from '~/lib/api';
import { uploadService } from '~/modules/attachment/offline/upload-service';
import { bindLocalUserDb } from '~/query/local-user-db';

bindLocalUserDb('test-user');

const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
const blobId = makeBlobKey(attachmentId, 'raw');
const cloudToken = { params: 'params', signature: 'signature' };
const storedKey = `/org-1/user-1/${attachmentId}.png`;

const storeBlob = (uploadStatus: AttachmentBlob['uploadStatus']) =>
  attachmentsDb.blobs.add({
    id: blobId,
    attachmentId,
    variant: 'raw',
    organizationId: 'org-1',
    blob: new Blob(['png']),
    filename: 'shot.png',
    uploadContext: { templateId: 'attachment' },
    size: 3,
    contentType: 'image/png',
    source: 'upload',
    uploadStatus,
    uploadAttempts: 0,
    nextRetryAt: null,
    lastError: null,
    storedAt: new Date(),
  });

const blob = () => attachmentsDb.blobs.get(blobId);

describe('uploadService: files uploaded after their row was created', () => {
  beforeEach(async () => {
    await attachmentsDb.blobs.clear();
    vi.clearAllMocks();
    addedFiles.length = 0;
    assemblyResults = { ':original': [{ url: storedKey, original_id: 'upload-1', mime: 'image/png' }] };
  });

  it('uploads a pending file and links its keys to the row', async () => {
    await storeBlob('pending');
    getUploadToken.mockResolvedValue(cloudToken);
    linkAttachmentKeys.mockResolvedValue({ id: attachmentId });

    await uploadService.processPendingUploads();

    expect(addedFiles[0]?.meta).toEqual({ attachmentId });
    expect(linkAttachmentKeys).toHaveBeenCalledWith({
      path: { tenantId: 'tenant-1', organizationId: 'org-1', id: attachmentId },
      body: { keys: { original: storedKey }, convertedContentType: null },
    });
    expect(insertEntitiesIntoHome).toHaveBeenCalledWith({}, [{ id: attachmentId }]);
    expect(await blob()).toMatchObject({ uploadStatus: 'uploaded', cloudKeys: { original: storedKey }, keysLinkedAt: expect.any(Date) });
  });

  it('leaves a pending file pending when the server cannot be reached', async () => {
    await storeBlob('pending');
    getUploadToken.mockRejectedValue(new TypeError('Failed to fetch'));

    await uploadService.processPendingUploads();

    expect((await blob())?.uploadStatus).toBe('pending');
  });

  it('retries the link after a 404, a create still queued, without uploading the file again', async () => {
    await storeBlob('pending');
    getUploadToken.mockResolvedValue(cloudToken);
    linkAttachmentKeys.mockRejectedValueOnce(new ApiError({ status: 404 })).mockResolvedValueOnce({ id: attachmentId });

    await uploadService.processPendingUploads();
    expect(await blob()).toMatchObject({ uploadStatus: 'uploaded', keysLinkedAt: null, linkAttempts: 1 });

    await uploadService.processPendingUploads();
    expect(addedFiles).toHaveLength(1);
    expect(linkAttachmentKeys).toHaveBeenCalledTimes(2);
    expect((await blob())?.keysLinkedAt).toEqual(expect.any(Date));
  });
});
