// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AttachmentBlob, attachmentsDb } from '../offline/attachments-db';

vi.mock('shared', async () => ({ appConfig: (await import('./test-setup')).mockAttachmentAppConfig }));
// The real owner-change source loads every per-user store; this file keeps one database bound throughout.
vi.mock('~/query/local-user-storage', () => ({ subscribeOwnerChange: () => () => {} }));

import { bindLocalUserDb } from '~/query/local-user-db';
import { useBlobUploadStatus } from '../hooks/use-blob-upload-status';

bindLocalUserDb('test-user');

type Info = ReturnType<typeof useBlobUploadStatus>;

/** Latest info and render count per probed attachment id. */
const seen = new Map<string, { info: Info; renders: number }>();

function Probe({ id }: { id: string }) {
  const info = useBlobUploadStatus(id);
  seen.set(id, { info, renders: (seen.get(id)?.renders ?? 0) + 1 });
  return null;
}

// The hook never reads the bytes, and jsdom's Blob does not survive fake-indexeddb's structured clone.
function makeBlob(id: string, overrides: Partial<AttachmentBlob> = {}): AttachmentBlob {
  const [attachmentId, variant] = id.split(':') as [string, AttachmentBlob['variant']];
  return {
    id,
    attachmentId,
    variant,
    organizationId: 'org-1',
    blob: {} as Blob,
    size: 4,
    contentType: 'image/png',
    source: 'download',
    uploadStatus: 'uploaded',
    storedAt: new Date(),
    ...overrides,
  };
}

let root: Root | undefined;

function render(ids: string[]) {
  root = createRoot(document.createElement('div'));
  root.render(ids.map((id) => <Probe key={id} id={id} />));
}

const infoOf = (id: string) => seen.get(id)?.info;
const rendersOf = (id: string) => seen.get(id)?.renders ?? 0;

describe('useBlobUploadStatus', () => {
  beforeEach(async () => {
    await attachmentsDb.blobs.clear();
  });

  afterEach(async () => {
    root?.unmount();
    root = undefined;
    seen.clear();
    await attachmentsDb.blobs.clear();
  });

  it('reads the raw blob status, else the first blob in key order, and defaults without a blob', async () => {
    await attachmentsDb.blobs.bulkAdd([
      makeBlob('a1:raw', { source: 'upload', uploadStatus: 'pending' }),
      makeBlob('a2:original'),
      makeBlob('a2:thumbnail'),
      makeBlob('a3:original'),
      makeBlob('a3:raw', { source: 'upload', uploadStatus: 'failed', lastError: 'boom' }),
      makeBlob('a4:converted', { source: 'upload', uploadStatus: 'local-only' }),
      makeBlob('a4:preview'),
    ]);

    render(['a1', 'a2', 'a3', 'a4', 'a5']);
    await vi.waitFor(() => expect(infoOf('a1')?.isPending).toBe(true));

    expect(infoOf('a1')).toMatchObject({ hasLocalBlob: true, isUploaded: false, isPending: true, lastError: null });
    expect(infoOf('a2')).toMatchObject({ hasLocalBlob: true, isUploaded: true, lastError: null });
    expect(infoOf('a3')).toMatchObject({ hasLocalBlob: true, isUploaded: false, isFailed: true, lastError: 'boom' });
    expect(infoOf('a4')).toMatchObject({ hasLocalBlob: true, isUploaded: false, isLocalOnly: true });
    expect(infoOf('a5')).toMatchObject({ hasLocalBlob: false, isUploaded: true, lastError: null });
    // A row whose info stays the default never renders again.
    expect(rendersOf('a5')).toBe(1);
  });

  it('rerenders only the rows whose status changed', async () => {
    await attachmentsDb.blobs.bulkAdd([
      makeBlob('a1:raw', { source: 'upload', uploadStatus: 'pending' }),
      makeBlob('a2:raw', { source: 'upload', uploadStatus: 'failed', lastError: 'boom' }),
    ]);

    render(['a1', 'a2', 'a3']);
    await vi.waitFor(() => expect(infoOf('a1')?.isPending).toBe(true));
    const a2Renders = rendersOf('a2');

    await attachmentsDb.blobs.update('a1:raw', { uploadStatus: 'uploading' });
    await vi.waitFor(() => expect(infoOf('a1')?.isUploading).toBe(true));
    await attachmentsDb.blobs.add(makeBlob('a3:original'));
    await vi.waitFor(() => expect(infoOf('a3')?.hasLocalBlob).toBe(true));

    expect(rendersOf('a2')).toBe(a2Renders);
  });

  it('drops an attachment once its blobs are deleted', async () => {
    await attachmentsDb.blobs.add(makeBlob('a1:raw', { source: 'upload', uploadStatus: 'failed', lastError: 'boom' }));

    render(['a1']);
    await vi.waitFor(() => expect(infoOf('a1')?.isFailed).toBe(true));

    await attachmentsDb.blobs.where('attachmentId').equals('a1').delete();
    await vi.waitFor(() => expect(infoOf('a1')).toMatchObject({ hasLocalBlob: false, isUploaded: true, isFailed: false, lastError: null }));
  });
});
