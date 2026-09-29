import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentsDb } from '../offline/attachments-db';

// Mock external deps before imports
vi.mock('shared', async () => ({
  appConfig: (await import('./test-setup')).mockAttachmentAppConfig,
}));

vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => true },
}));

vi.mock('../offline/storage-service', () => ({
  attachmentStorage: {
    getStorageUsed: vi.fn().mockResolvedValue(0),
    hasVariant: vi.fn().mockResolvedValue(false),
    storeDownloadBlobWithVariant: vi.fn().mockResolvedValue({}),
    evictRawBlob: vi.fn().mockResolvedValue(false),
    getStoredVariants: vi.fn().mockResolvedValue([]),
    deleteBlobs: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../file-url', async () => {
  // Keep the real getVariantKey (pure key lookup the service branches on); stub only the network.
  const actual = await vi.importActual<typeof import('../file-url')>('../file-url');
  return { ...actual, getCloudUrl: vi.fn().mockResolvedValue('https://example.com/file.png') };
});

vi.mock('../query', () => ({
  findAttachmentInCache: vi.fn().mockReturnValue(null),
  attachmentQueryKeys: { list: { base: ['attachment', 'list'] }, delete: ['attachment', 'delete'] },
}));

vi.mock('~/query/basic/flatten', () => ({
  flattenInfiniteData: vi.fn().mockReturnValue([]),
}));

vi.mock('~/query/query-client', () => ({
  queryClient: {
    getQueryCache: () => ({ subscribe: vi.fn() }),
    getMutationCache: () => ({ subscribe: vi.fn() }),
  },
}));

vi.mock('~/query/local-user-storage', () => ({
  subscribeOwnerChange: () => () => {},
}));

import { bindLocalUserDb } from '~/query/local-user-db';
import { downloadQueue } from '../offline/download-queue';
import { downloadService } from '../offline/download-service';
import { attachmentStorage } from '../offline/storage-service';
import { findAttachmentInCache } from '../query';
import { makeAttachment, makeQueueEntry } from './test-setup';

// Attachment tables live in the per-user localUserDb; bind one so `attachmentsDb` resolves.
bindLocalUserDb('test-user');

describe('downloadService.processQueue: failed download retry', () => {
  beforeEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    await attachmentsDb.blobs.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    await attachmentsDb.blobs.clear();
  });

  it('processQueue does not pick up failed entries itself (reviving happens on enqueue)', async () => {
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'failed', attempts: 1 }));

    await downloadService.processQueue();

    const entry = await attachmentsDb.downloadQueue.get('att-1');
    expect(entry?.status).toBe('failed');
    expect(entry?.attempts).toBe(1); // no retry attempt added
  });

  it('re-queues a failed entry when the attachment is seen again and attempts remain', async () => {
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'failed', attempts: 1 }));

    await downloadService.queueForDownload([makeAttachment({ id: 'att-1' })]);

    const entry = await attachmentsDb.downloadQueue.get('att-1');
    expect(entry?.status).toBe('pending');
  });
});

describe('downloadService.queueForDownload: optimistic filtering', () => {
  beforeEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    vi.clearAllMocks();
    vi.mocked(attachmentStorage.getStoredVariants).mockResolvedValue([]);
  });

  afterEach(async () => {
    await attachmentsDb.downloadQueue.clear();
  });

  it('does not queue optimistic (un-persisted) attachments', async () => {
    const optimistic = { ...makeAttachment({ id: 'opt-1' }), _optimistic: true };

    await downloadService.queueForDownload([optimistic]);

    const entry = await attachmentsDb.downloadQueue.get('opt-1');
    expect(entry).toBeUndefined();
  });

  it('queues persisted attachments alongside optimistic ones', async () => {
    const optimistic = { ...makeAttachment({ id: 'opt-1' }), _optimistic: true };
    const persisted = makeAttachment({ id: 'real-1' });

    await downloadService.queueForDownload([optimistic, persisted]);

    expect(await attachmentsDb.downloadQueue.get('opt-1')).toBeUndefined();
    expect((await attachmentsDb.downloadQueue.get('real-1'))?.status).toBe('pending');
  });
});

describe('downloadService: cache lookup before claim', () => {
  beforeEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    vi.clearAllMocks();
    vi.mocked(attachmentStorage.getStoredVariants).mockResolvedValue([]);
    vi.mocked(attachmentStorage.hasVariant).mockResolvedValue(false);
  });

  afterEach(async () => {
    await attachmentsDb.downloadQueue.clear();
  });

  it('leaves row pending and never transitions to downloading when cache is empty', async () => {
    vi.mocked(findAttachmentInCache).mockReturnValue(undefined);
    const transitionSpy = vi.spyOn(downloadQueue, 'transition');

    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'pending' }));

    await downloadService.processQueue();

    const entry = await attachmentsDb.downloadQueue.get('att-1');
    expect(entry?.status).toBe('pending'); // liveQuery will retrigger when cache fills
    expect(entry?.attempts).toBe(0); // no attempt burned
    // The service must not have claimed the row.
    expect(transitionSpy).not.toHaveBeenCalledWith('att-1', 'downloading');

    transitionSpy.mockRestore();
  });
});

describe('downloadService: auth fail-fast (401/403)', () => {
  beforeEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    vi.clearAllMocks();
    vi.mocked(attachmentStorage.getStoredVariants).mockResolvedValue([]);
    vi.mocked(attachmentStorage.hasVariant).mockResolvedValue(false);
  });

  afterEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    vi.unstubAllGlobals();
  });

  it('marks failed and stops fetching remaining variants on 403', async () => {
    vi.mocked(findAttachmentInCache).mockReturnValue(
      makeAttachment({
        keys: {
          original: 'files/orig.png',
          preview: 'files/thumb.png',
          converted: 'files/conv.png',
        },
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'pending' }));

    await downloadService.processQueue();

    const entry = await attachmentsDb.downloadQueue.get('att-1');
    expect(entry?.status).toBe('failed');
    // A 403 stops the loop before the other 2 variants.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // No blobs stored for a fully-failed attachment.
    expect(attachmentStorage.storeDownloadBlobWithVariant).not.toHaveBeenCalled();
  });

  it('marks failed and stops fetching remaining variants on 401', async () => {
    vi.mocked(findAttachmentInCache).mockReturnValue(
      makeAttachment({
        keys: {
          original: 'files/orig.png',
          preview: 'files/thumb.png',
          converted: 'files/conv.png',
        },
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'pending' }));

    await downloadService.processQueue();

    const entry = await attachmentsDb.downloadQueue.get('att-1');
    expect(entry?.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
