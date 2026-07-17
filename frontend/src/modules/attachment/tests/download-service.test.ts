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
    clear: vi.fn(),
    getQueryCache: () => ({ subscribe: vi.fn() }),
    getMutationCache: () => ({ subscribe: vi.fn() }),
  },
}));

vi.mock('~/query/app-storage', () => ({
  subscribeOwnerChange: () => () => {},
}));

vi.mock('~/query/persister', () => ({
  persister: { removeClient: vi.fn() },
  sessionPersister: { removeClient: vi.fn() },
}));

vi.mock('~/modules/common/alerter/alert-store', () => ({
  useAlertStore: { getState: () => ({ clearAlertStore: vi.fn() }) },
}));

vi.mock('~/modules/common/form-draft/draft-store', () => ({
  useDraftStore: { getState: () => ({ clearForms: vi.fn() }) },
}));

vi.mock('~/modules/seen/seen-store', () => ({
  useSeenStore: { getState: () => ({ clear: vi.fn() }) },
}));

vi.mock('~/modules/ui/ui-store', () => ({
  useUIStore: { getState: () => ({ setImpersonating: vi.fn(), reset: vi.fn() }) },
}));

vi.mock('~/modules/user/user-store', () => ({
  useUserStore: { getState: () => ({ reset: vi.fn() }) },
}));

vi.mock('~/modules/me/types', () => ({}));

import { bindAppDb } from '~/query/app-db';
import { downloadQueue } from '../offline/download-queue';
import { downloadService } from '../offline/download-service';
import { attachmentStorage } from '../offline/storage-service';
import { findAttachmentInCache } from '../query';
import { makeAttachment, makeQueueEntry } from './test-setup';

// Attachment tables live in the per-user appdb; bind one so `attachmentsDb` resolves.
bindAppDb('test-user');

describe('downloadService.processQueue — failed download retry', () => {
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

  it('does NOT re-queue a failed entry once attempts reach the cap', async () => {
    // downloadRetryAttempts is 3 in the test config.
    await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'failed', attempts: 3 }));

    await downloadService.queueForDownload([makeAttachment({ id: 'att-1' })]);

    const entry = await attachmentsDb.downloadQueue.get('att-1');
    expect(entry?.status).toBe('failed');
    expect(entry?.attempts).toBe(3);
  });

  it('downloaded entries persist, serving as the dedupe registry', async () => {
    await attachmentsDb.downloadQueue.add(
      makeQueueEntry({ id: 'att-done', status: 'downloaded', organizationId: 'org-1' }),
    );
    // Need a pending entry to trigger processing for this org
    await attachmentsDb.downloadQueue.add(
      makeQueueEntry({ id: 'att-pending', status: 'pending', organizationId: 'org-1' }),
    );

    await downloadService.processQueue();

    // Downloaded rows serve as the dedupe registry.
    const downloaded = await attachmentsDb.downloadQueue.get('att-done');
    expect(downloaded?.status).toBe('downloaded');
  });
});

describe('downloadService.queueForDownload — optimistic filtering', () => {
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

describe('downloadService — cache lookup before claim', () => {
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

describe('downloadService — auth fail-fast (401/403)', () => {
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
        thumbnailKey: 'files/thumb.png',
        convertedKey: 'files/conv.png',
        originalKey: 'files/orig.png',
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
        thumbnailKey: 'files/thumb.png',
        convertedKey: 'files/conv.png',
        originalKey: 'files/orig.png',
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

describe('teardownUserState clears attachment IDB', () => {
  beforeEach(async () => {
    await attachmentsDb.blobs.clear();
    await attachmentsDb.downloadQueue.clear();
  });

  afterEach(async () => {
    await attachmentsDb.blobs.clear();
    await attachmentsDb.downloadQueue.clear();
  });

  it('deletes the appdb on sign-out, wiping all attachment data', async () => {
    const { getAppDb, bindAppDb } = await import('~/query/app-db');
    const { teardownUserState } = await import('~/utils/teardown-user-state');

    // Sanity: the appdb is bound (attachment data reachable) before sign-out.
    expect(getAppDb()).not.toBeNull();

    await teardownUserState();

    // Sign-out deletes and unbinds the appdb.
    expect(getAppDb()).toBeNull();

    // Re-bind so the suite's afterEach table cleanup has a DB to operate on.
    bindAppDb('test-user');
  });
});
