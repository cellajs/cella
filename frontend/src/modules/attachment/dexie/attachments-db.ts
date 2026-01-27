/**
 * Dexie Database for Attachment File Storage
 *
 * This idb database stores:
 * - attachmentCache: Cached file blobs for offline viewing
 * - attachmentFiles: Files created offline, pending upload
 */
import { appConfig } from 'config';
import { Dexie, type EntityTable } from 'dexie';
import type { Attachment } from '~/api.gen';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

export type SyncStatus = 'idle' | 'processing' | 'synced' | 'failed';

/** Pending file upload created offline, waiting to sync */
export interface AttachmentFile extends Pick<Attachment, 'id' | 'organizationId' | 'groupId'> {
  files: Record<string, CustomUppyFile>;
  tokenQuery: UploadTokenQuery;
  // Sync state
  syncStatus: SyncStatus;
  syncAttempts: number;
  lastSyncAttempt?: Date;
  maxRetries: number;
  nextRetryAt?: Date;
  // Local timestamps (when queued/updated in IndexedDB, not server timestamps)
  queuedAt: Date;
  localUpdatedAt: Date;
}

/** Cached file blob for offline viewing */
export interface CachedAttachment extends Pick<Attachment, 'id' | 'groupId'> {
  file: File;
}

export class AttachmentsDatabase extends Dexie {
  attachmentCache!: EntityTable<CachedAttachment, 'id'>;
  attachmentFiles!: EntityTable<AttachmentFile, 'id'>;

  constructor() {
    super(`${appConfig.slug}-attachments`);

    // Only indexed fields need to be listed. Use '&' for unique primary key (not '++' which is auto-increment)
    this.version(1).stores({
      attachmentCache: '&id, groupId',
      attachmentFiles: '&id, organizationId, syncStatus, [organizationId+syncStatus]',
    });
  }
}

export const attachmentsDb = new AttachmentsDatabase();
