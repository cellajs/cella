import { liveQuery, type Subscription } from 'dexie';
import { useSyncExternalStore } from 'react';
import { type AttachmentBlob, attachmentsDb, type UploadStatus } from '~/modules/attachment/offline/attachments-db';
import { getLocalUserDb } from '~/query/local-user-db';
import { subscribeOwnerChange } from '~/query/local-user-storage';

interface BlobUploadInfo {
  /** False when no local blob exists for this attachment, meaning it lives only in the cloud. */
  hasLocalBlob: boolean;
  isUploaded: boolean;
  isUploading: boolean;
  isFailed: boolean;
  isPending: boolean;
  isLocalOnly: boolean;
  lastError: string | null;
}

/** No local blob means the attachment is cloud-only, which is the "done" state for the UI. */
const defaultUploadInfo: BlobUploadInfo = {
  hasLocalBlob: false,
  isUploaded: true,
  isUploading: false,
  isFailed: false,
  isPending: false,
  isLocalOnly: false,
  lastError: null,
};

function toUploadInfo(uploadStatus: UploadStatus, lastError: string | null | undefined): BlobUploadInfo {
  return {
    hasLocalBlob: true,
    isUploaded: uploadStatus === 'uploaded',
    isUploading: uploadStatus === 'uploading',
    isFailed: uploadStatus === 'failed',
    isPending: uploadStatus === 'pending',
    isLocalOnly: uploadStatus === 'local-only',
    lastError: lastError ?? null,
  };
}

/** Marking a blob uploaded clears its lastError, and downloaded blobs never carry one. */
const uploadedInfo = toUploadInfo('uploaded', null);

const sameInfo = (a: BlobUploadInfo, b: BlobUploadInfo) => (Object.keys(a) as (keyof BlobUploadInfo)[]).every((key) => a[key] === b[key]);

/**
 * Upload info per attachment id. Primary keys come from the index alone, so cached downloads are never deserialized;
 * only blobs that are not uploaded yet are read in full.
 */
async function readUploadInfos(): Promise<Map<string, BlobUploadInfo>> {
  const infos = new Map<string, BlobUploadInfo>();
  if (!getLocalUserDb()) return infos;

  const ids = await attachmentsDb.blobs.toCollection().primaryKeys();
  const syncing: AttachmentBlob[] = await attachmentsDb.blobs.where('uploadStatus').notEqual('uploaded').toArray();
  const syncingById = new Map(syncing.map((blob) => [blob.id, blob]));

  // The raw blob carries the upload state; without one, the attachment's first blob in key order (`${attachmentId}:${variant}`).
  const primaryIds = new Map<string, string>();
  for (const id of ids) {
    const attachmentId = id.slice(0, id.lastIndexOf(':'));
    if (!primaryIds.has(attachmentId) || id.endsWith(':raw')) primaryIds.set(attachmentId, id);
  }

  for (const [attachmentId, id] of primaryIds) {
    const blob = syncingById.get(id);
    infos.set(attachmentId, blob ? toUploadInfo(blob.uploadStatus, blob.lastError) : uploadedInfo);
  }
  return infos;
}

// One live query serves every mounted badge: rows resolve in a single render, and unchanged rows keep their snapshot.
let infos = new Map<string, BlobUploadInfo>();
const listeners = new Set<() => void>();
let subscription: Subscription | null = null;
let stopOwnerChange: (() => void) | null = null;

function publish(next: Map<string, BlobUploadInfo>) {
  for (const [attachmentId, info] of next) {
    const prev = infos.get(attachmentId);
    if (prev && sameInfo(prev, info)) next.set(attachmentId, prev);
  }
  infos = next;
  for (const listener of listeners) listener();
}

function subscribeQuery() {
  subscription?.unsubscribe();
  subscription = liveQuery(readUploadInfos).subscribe({
    next: publish,
    error: (err) => console.error('[useBlobUploadStatus] Blob liveQuery error:', err),
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    subscribeQuery();
    // liveQuery tracks only the DB it first resolved, so re-subscribe when the per-user localUserDb rebinds.
    stopOwnerChange = subscribeOwnerChange(() => {
      publish(new Map());
      subscribeQuery();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    subscription?.unsubscribe();
    subscription = null;
    stopOwnerChange?.();
    stopOwnerChange = null;
    infos = new Map();
  };
}

/** Reactive upload status; falls back to the default "uploaded" info with no id or no blob. */
export function useBlobUploadStatus(attachmentId: string | null | undefined): BlobUploadInfo {
  return useSyncExternalStore(subscribe, () => (attachmentId && infos.get(attachmentId)) || defaultUploadInfo);
}
