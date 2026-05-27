import type { DownloadQueueEntry } from '../dexie/attachments-db';

/** Shared mock appConfig for attachment tests */
export const mockAttachmentAppConfig = {
  slug: 'test',
  localBlobStorage: {
    enabled: true,
    maxFileSize: 50 * 1024 * 1024,
    maxTotalSize: 100 * 1024 * 1024,
    allowedContentTypes: [],
    excludedContentTypes: ['video/*'],
    downloadConcurrency: 2,
    uploadRetryAttempts: 3,
    uploadRetryDelays: [1000, 2000, 3000],
  },
};

/** Factory for DownloadQueueEntry test data */
export function makeQueueEntry(overrides: Partial<DownloadQueueEntry> = {}): DownloadQueueEntry {
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

/** Factory for attachment-like objects */
export function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    organizationId: 'org-1',
    contentType: 'image/png',
    size: '1024',
    originalKey: 'files/original.png',
    thumbnailKey: null,
    convertedKey: null,
    public: false,
    tenantId: 'tenant-1',
    ...overrides,
  } as any;
}
