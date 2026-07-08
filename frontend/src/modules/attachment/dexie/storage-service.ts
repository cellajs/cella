import { appConfig } from 'shared';
import {
  type AttachmentBlob,
  attachmentsDb,
  type BlobVariant,
  makeBlobKey,
  type UploadContext,
  type UploadStatus,
} from '~/modules/attachment/dexie/attachments-db';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import { getAppDb } from '~/query/app-db';

/** Fallback chain for blob resolution, in lookup order. */
const displayFallbackChain: BlobVariant[] = ['converted', 'original', 'raw'];
const thumbnailFallbackChain: BlobVariant[] = ['thumbnail', 'original', 'raw'];

/**
 * Attachment storage service with local-first capabilities.
 */
class AttachmentStorageService {
  /**
   * Get a blob by attachment ID and variant, with optional fallback chain.
   */
  async getBlobWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    useFallback = false,
  ): Promise<{ blob: AttachmentBlob; actualVariant: BlobVariant } | null> {
    const chain = useFallback ? (variant === 'thumbnail' ? thumbnailFallbackChain : displayFallbackChain) : [variant];

    for (const v of chain) {
      const key = makeBlobKey(attachmentId, v);
      const blob = await this.getBlob(key);
      if (blob) {
        return { blob, actualVariant: v };
      }
    }
    return null;
  }

  /**
   * Create a blob URL for a specific variant with fallback.
   * Returns the URL and which variant was actually used.
   */
  async createBlobUrlWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    useFallback = true,
  ): Promise<{ url: string; actualVariant: BlobVariant } | null> {
    const result = await this.getBlobWithVariant(attachmentId, variant, useFallback);
    if (!result) return null;

    const url = URL.createObjectURL(result.blob.blob);
    return { url, actualVariant: result.actualVariant };
  }

  /**
   * Store a downloaded blob with variant.
   */
  async storeDownloadBlobWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    organizationId: string,
    blob: Blob,
    contentType: string,
  ): Promise<AttachmentBlob> {
    const key = makeBlobKey(attachmentId, variant);

    const record: AttachmentBlob = {
      id: key,
      attachmentId,
      variant,
      organizationId,
      blob,
      size: blob.size,
      contentType,
      source: 'download',
      uploadStatus: 'uploaded',
      storedAt: new Date(),
    };

    try {
      await attachmentsDb.blobs.put(record);
      return record;
    } catch (error) {
      console.error('Failed to store download blob:', error);
      throw error;
    }
  }

  /**
   * Evict raw blob after processed version is available.
   * Call this when 'original' variant is successfully downloaded.
   */
  async evictRawBlob(attachmentId: string): Promise<boolean> {
    const rawKey = makeBlobKey(attachmentId, 'raw');
    try {
      // Safety net: never drop the raw blob unless a durable replacement variant is actually
      // persisted locally. If an 'original' store was rolled back / raced, evicting raw could leave
      // the attachment with no local blob at all — and a no-cloud-key resource then becomes
      // permanently unresolvable ("This resource does not exist or has been deleted").
      const hasDurable =
        (await this.hasVariant(attachmentId, 'original')) || (await this.hasVariant(attachmentId, 'converted'));
      if (!hasDurable) {
        console.debug(`[Storage] Skipped raw eviction for ${attachmentId} — no durable variant stored`);
        return false;
      }

      const exists = await attachmentsDb.blobs.get(rawKey);
      if (exists) {
        await attachmentsDb.blobs.delete(rawKey);
        console.debug(`[Storage] Evicted raw blob for ${attachmentId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to evict raw blob (${attachmentId}):`, error);
      return false;
    }
  }

  /**
   * Check if any variant of an attachment exists locally.
   */
  async hasAnyVariant(attachmentId: string): Promise<BlobVariant | null> {
    for (const variant of ['original', 'converted', 'thumbnail', 'raw'] as BlobVariant[]) {
      const key = makeBlobKey(attachmentId, variant);
      const exists = await attachmentsDb.blobs.get(key);
      if (exists) return variant;
    }
    return null;
  }

  /**
   * Check if a specific variant of an attachment exists locally.
   * Cheap: single primary-key lookup on the composite key.
   */
  async hasVariant(attachmentId: string, variant: BlobVariant): Promise<boolean> {
    try {
      const key = makeBlobKey(attachmentId, variant);
      const exists = await attachmentsDb.blobs.get(key);
      return !!exists;
    } catch {
      return false;
    }
  }

  /**
   * Get all variants stored for an attachment.
   */
  async getStoredVariants(attachmentId: string): Promise<BlobVariant[]> {
    try {
      const blobs = await attachmentsDb.blobs.where('attachmentId').equals(attachmentId).toArray();
      return blobs.map((b) => b.variant);
    } catch (error) {
      return [];
    }
  }

  /** Store a blob from Uppy file upload (stores as 'raw' variant). */
  async storeUploadBlob(
    file: CustomUppyFile,
    organizationId: string,
    uploadStatus: UploadStatus = 'pending',
    uploadContext?: UploadContext,
    attachmentId?: string,
  ): Promise<AttachmentBlob> {
    // Validate file has blob data
    if (!file.data || !(file.data instanceof Blob)) {
      throw new Error('File data must be a Blob');
    }

    const blobData = file.data;
    const size = file.size ?? blobData.size ?? 0;

    // Use provided attachmentId or fall back to file.id for temp storage
    const actualAttachmentId = attachmentId || file.id;
    const key = makeBlobKey(actualAttachmentId, 'raw');

    const blob: AttachmentBlob = {
      id: key,
      attachmentId: actualAttachmentId,
      variant: 'raw',
      organizationId,
      blob: blobData,
      filename: file.name || undefined,
      uploadContext,
      size,
      contentType: file.type || 'application/octet-stream',
      source: 'upload',
      uploadStatus,
      syncAttempts: 0,
      nextRetryAt: null,
      lastError: null,
      storedAt: new Date(),
    };

    try {
      await attachmentsDb.blobs.add(blob);
      return blob;
    } catch (error) {
      console.error('Failed to store upload blob:', error);
      throw error;
    }
  }

  /**
   * Get a blob by composite key (id:variant format).
   */
  async getBlob(id: string): Promise<AttachmentBlob | undefined> {
    try {
      return await attachmentsDb.blobs.get(id);
    } catch (error) {
      console.error(`Failed to get blob (${id}):`, error);
      return undefined;
    }
  }

  /**
   * Delete blobs by attachment IDs (deletes all variants).
   */
  async deleteBlobs(ids: string[]): Promise<void> {
    try {
      // Delete all variants for each attachment ID
      for (const id of ids) {
        await attachmentsDb.blobs.where('attachmentId').equals(id).delete();
      }
    } catch (error) {
      console.error('Failed to delete blobs:', error);
      throw error;
    }
  }

  /**
   * Update upload status for a blob.
   */
  async updateUploadStatus(id: string, status: UploadStatus, error?: string): Promise<void> {
    try {
      const updates: Partial<AttachmentBlob> = { uploadStatus: status };

      if (status === 'failed' && error) {
        const blob = await attachmentsDb.blobs.get(id);
        if (blob) {
          const attempts = blob.syncAttempts ?? 0;
          updates.syncAttempts = attempts + 1;
          updates.lastError = error;

          // Exponential backoff using config
          const config = appConfig.localBlobStorage;
          const delays = config?.uploadRetryDelays ?? [60000, 300000, 900000];
          const delay = delays[Math.min(attempts, delays.length - 1)];
          updates.nextRetryAt = new Date(Date.now() + delay);
        }
      }

      if (status === 'uploaded') {
        updates.lastError = null;
        updates.nextRetryAt = null;
      }

      await attachmentsDb.blobs.update(id, updates);
    } catch (error) {
      console.error(`Failed to update sync status (${id}):`, error);
      throw error;
    }
  }

  /**
   * Mark upload as uploading.
   */
  async markUploading(id: string): Promise<void> {
    await this.updateUploadStatus(id, 'uploading');
  }

  /**
   * Mark upload as uploaded (successfully uploaded to cloud).
   */
  async markUploaded(id: string): Promise<void> {
    await this.updateUploadStatus(id, 'uploaded');
  }

  /**
   * Mark upload as failed with error.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.updateUploadStatus(id, 'failed', error);
  }

  /** Get total storage used by blobs for an organization. */
  async getStorageUsed(organizationId: string): Promise<number> {
    try {
      const blobs = await attachmentsDb.blobs.where('organizationId').equals(organizationId).toArray();
      return blobs.reduce((total, blob) => total + blob.size, 0);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clear all blobs and download queue entries (for sign-out/cleanup).
   */
  async clearAll(): Promise<void> {
    if (!getAppDb()) return; // No per-user DB bound (signed out / impersonating)
    try {
      await attachmentsDb.blobs.clear();
      await attachmentsDb.downloadQueue.clear();
    } catch (error) {
      console.error('Failed to clear attachment storage:', error);
    }
  }
}

/** Stores upload/download blobs and exposes blob URLs for attachment rendering. */
export const attachmentStorage = new AttachmentStorageService();
