/**
 * Dexie Database for Attachment File Storage
 *
 * ATTACHMENT-SPECIFIC - Do NOT copy for other entities.
 *
 * This database stores:
 * - attachmentCache: Cached file blobs for offline viewing
 * - attachmentFiles: Files created offline, pending upload
 *
 * Other product entities don't need Dexie storage because they don't
 * have associated file blobs. They only store metadata which is handled
 * by the Electric sync + TanStack DB layer.
 */
import { appConfig } from 'config';
import { Dexie, type EntityTable } from 'dexie';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

export type SyncStatus = 'idle' | 'processing' | 'synced' | 'failed';

// TODO van we use parts of Attachment model from api.gen.ts?
export interface AttachmentFile {
  id: string;
  files: Record<string, CustomUppyFile>;
  organizationId: string;
  tokenQuery: UploadTokenQuery;
  syncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
  syncAttempts: number;
  lastSyncAttempt?: Date;
  maxRetries: number;
  nextRetryAt?: Date;
}

export interface CachedAttachment {
  id: string;
  file: File;
  groupId: string | null;
}

export class AttachmentsDatabase extends Dexie {
  attachmentCache!: EntityTable<CachedAttachment, 'id'>;
  attachmentFiles!: EntityTable<AttachmentFile, 'id'>;

  constructor() {
    super(`${appConfig.slug}-attachments`);

    this.version(1).stores({
      attachmentCache: '++id, file, groupId',
      attachmentFiles:
        '++id, fileId, organizationId, syncStatus, createdAt, updatedAt, syncAttempts, lastSyncAttempt, maxRetries, nextRetryAt, [organizationId+syncStatus]',
    });
  }
}

export const attachmentsDb = new AttachmentsDatabase();
