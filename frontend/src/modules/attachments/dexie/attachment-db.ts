import { appConfig } from 'config';
import { Dexie, type EntityTable } from 'dexie';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

export type SyncStatus = 'idle' | 'processing' | 'synced' | 'failed';

export interface AttachmentFile {
  id?: number;
  fileId: string; // Uppy file ID
  file: CustomUppyFile;
  organizationId: string;
  batchId: string; // Groups files uploaded together
  tokenQuery: UploadTokenQuery;
  syncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
  syncAttempts?: number;
  lastSyncAttempt?: Date;
  errorMessage?: string;
}

export interface CachedAttachment {
  id: string;
  file: File;
  groupId: string | null;
}

export class AttachmentDatabase extends Dexie {
  attachmentCache!: EntityTable<CachedAttachment, 'id'>;
  attachmentFiles!: EntityTable<AttachmentFile, 'id'>;

  // attachmentBatches: EntityTable<AttachmentBatch, 'id'>;

  constructor() {
    super(`${appConfig.name}-attachment-daatabase`);

    this.version(1).stores({
      attachmentCache: '++id, file, groupId',
      attachmentFiles: '++id, fileId, organizationId, batchId, syncStatus, createdAt, updatedAt, [organizationId+syncStatus]',
    });
  }
}

export const attachmentDb = new AttachmentDatabase();
