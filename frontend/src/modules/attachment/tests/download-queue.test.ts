import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentsDb } from '../dexie/attachments-db';

// Mock external deps
vi.mock('shared', async () => ({
  appConfig: (await import('./test-setup')).mockAttachmentAppConfig,
}));

vi.mock('../dexie/storage-service', () => ({
  attachmentStorage: {
    getStoredVariants: vi.fn().mockResolvedValue([]),
  },
}));

import { downloadQueue } from '../dexie/download-queue';
import { attachmentStorage } from '../dexie/storage-service';
import { makeAttachment, makeQueueEntry } from './test-setup';

describe('downloadQueue', () => {
  beforeEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    await attachmentsDb.blobs.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await attachmentsDb.downloadQueue.clear();
    await attachmentsDb.blobs.clear();
  });

  describe('transition', () => {
    it('pending → downloading increments attempts', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ attempts: 0 }));

      await downloadQueue.transition('att-1', 'downloading');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('downloading');
      expect(entry?.attempts).toBe(1);
    });

    it('downloading → downloaded is valid', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'downloading', attempts: 1 }));

      await downloadQueue.transition('att-1', 'downloaded');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('downloaded');
    });

    it('downloading → failed does NOT increment attempts', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'downloading', attempts: 1 }));

      await downloadQueue.transition('att-1', 'failed');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('failed');
      expect(entry?.attempts).toBe(1); // unchanged
    });

    it('failed → pending is rejected (terminal state)', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'failed', attempts: 1 }));

      await downloadQueue.transition('att-1', 'pending');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('failed'); // unchanged — failed is terminal
    });

    it('skipped → pending re-queues', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'skipped', skipReason: 'No originalKey' }));

      await downloadQueue.transition('att-1', 'pending');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('pending');
    });

    it('downloaded → downloading is rejected (terminal state)', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'downloaded' }));

      await downloadQueue.transition('att-1', 'downloading');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('downloaded'); // unchanged
    });

    it('downloaded → pending is rejected (terminal state)', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'downloaded' }));

      await downloadQueue.transition('att-1', 'pending');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('downloaded'); // unchanged
    });

    it('pending → downloaded is rejected (must go through downloading)', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'pending' }));

      await downloadQueue.transition('att-1', 'downloaded');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('pending'); // unchanged
    });

    it('transition sets skipReason when provided', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'pending' }));

      await downloadQueue.transition('att-1', 'skipped', 'No originalKey');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('skipped');
      expect(entry?.skipReason).toBe('No originalKey');
    });

    it('non-existent entry is silently ignored', async () => {
      await downloadQueue.transition('does-not-exist', 'downloading');
      // No error thrown
    });
  });

  describe('enqueue', () => {
    it('new attachments are enqueued as pending', async () => {
      await downloadQueue.enqueue([makeAttachment()], 'org-1');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('pending');
      expect(entry?.priority).toBe(1); // image priority
    });

    it('attachments with processed variants are skipped', async () => {
      // Simulate existing blob key for this attachment
      await attachmentsDb.blobs.add({
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
      });
      vi.mocked(attachmentStorage.getStoredVariants).mockResolvedValueOnce(['original']);

      await downloadQueue.enqueue([makeAttachment()], 'org-1');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry).toBeUndefined(); // not enqueued
    });

    it('already-queued attachments are not duplicated', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'pending' }));

      await downloadQueue.enqueue([makeAttachment()], 'org-1');

      const count = await attachmentsDb.downloadQueue.count();
      expect(count).toBe(1);
    });

    it('skipped entries with No originalKey get reset when key arrives', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ status: 'skipped', skipReason: 'No originalKey' }));

      await downloadQueue.enqueue([makeAttachment({ originalKey: 'files/now-available.png' })], 'org-1');

      const entry = await attachmentsDb.downloadQueue.get('att-1');
      expect(entry?.status).toBe('pending');
      expect(entry?.skipReason).toBeNull();
    });

    it('excluded content types are enqueued as skipped', async () => {
      await downloadQueue.enqueue([makeAttachment({ id: 'vid-1', contentType: 'video/mp4' })], 'org-1');

      const entry = await attachmentsDb.downloadQueue.get('vid-1');
      expect(entry?.status).toBe('skipped');
      expect(entry?.skipReason).toContain('Content type excluded');
    });
  });

  describe('gc', () => {
    it('removes downloaded entries', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'downloaded' }));
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-2', status: 'downloaded' }));

      await downloadQueue.gc('org-1');

      const count = await attachmentsDb.downloadQueue.count();
      expect(count).toBe(0);
    });

    it('removes skipped entries', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'skipped' }));

      await downloadQueue.gc('org-1');

      const count = await attachmentsDb.downloadQueue.count();
      expect(count).toBe(0);
    });

    it('preserves pending and failed entries', async () => {
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-1', status: 'pending' }));
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-2', status: 'failed' }));
      await attachmentsDb.downloadQueue.add(makeQueueEntry({ id: 'att-3', status: 'downloaded' }));

      await downloadQueue.gc('org-1');

      const remaining = await attachmentsDb.downloadQueue.toArray();
      expect(remaining).toHaveLength(2);
      expect(remaining.map((e) => e.id).sort()).toEqual(['att-1', 'att-2']);
    });
  });
});
