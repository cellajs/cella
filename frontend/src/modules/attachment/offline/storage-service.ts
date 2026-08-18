import { appConfig } from 'shared';
import {
  type AttachmentBlob,
  attachmentsDb,
  type BlobVariant,
  makeBlobKey,
  type UploadContext,
  type UploadStatus,
} from '~/modules/attachment/offline/attachments-db';
import type { CustomUppyFile } from '~/modules/common/uploader/types';

/** Fallback chain for blob resolution, in lookup order. */
const displayFallbackChain: BlobVariant[] = ['converted', 'original', 'raw'];
const previewFallbackChain: BlobVariant[] = ['preview', 'original', 'raw'];
const thumbnailFallbackChain: BlobVariant[] = ['thumbnail', 'preview', 'original', 'raw'];

class AttachmentStorageService {
  /** Blob URLs keyed by attachment id + variant; the service revokes them when the attachment's blobs change, so consumers must not. */
  private sharedBlobUrls = new Map<string, string>();

  private async getBlobWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    useFallback = false,
  ): Promise<{ blob: AttachmentBlob; actualVariant: BlobVariant } | null> {
    const chain = !useFallback
      ? [variant]
      : variant === 'thumbnail'
        ? thumbnailFallbackChain
        : variant === 'preview'
          ? previewFallbackChain
          : displayFallbackChain;

    for (const v of chain) {
      const key = makeBlobKey(attachmentId, v);
      const blob = await this.getBlob(key);
      if (blob) {
        return { blob, actualVariant: v };
      }
    }
    return null;
  }

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

  /** Cached blob URL, stable until the attachment's blobs change; the service owns revocation. */
  async getSharedBlobUrl(attachmentId: string, variant: BlobVariant, useFallback = true): Promise<string | null> {
    const key = `${attachmentId}::${variant}::${useFallback ? 'fb' : 'nf'}`;
    const cached = this.sharedBlobUrls.get(key);
    if (cached) return cached;

    const result = await this.getBlobWithVariant(attachmentId, variant, useFallback);
    if (!result) return null;

    // A concurrent resolve may have populated the cache while this call awaited the blob lookup.
    const raced = this.sharedBlobUrls.get(key);
    if (raced) return raced;

    const url = URL.createObjectURL(result.blob.blob);
    this.sharedBlobUrls.set(key, url);
    return url;
  }

  /** Revoke and drop every cached shared blob URL for an attachment; call whenever its blobs change. */
  private invalidateSharedBlobUrls(attachmentId: string): void {
    const prefix = `${attachmentId}::`;
    for (const [key, url] of this.sharedBlobUrls) {
      if (!key.startsWith(prefix)) continue;
      URL.revokeObjectURL(url);
      this.sharedBlobUrls.delete(key);
    }
  }

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
      // Drop stale shared URLs so the next resolve picks up this variant.
      this.invalidateSharedBlobUrls(attachmentId);
      return record;
    } catch (error) {
      console.error('[AttachmentStorage] Failed to store download blob:', error);
      throw error;
    }
  }

  /** Evicts the raw blob once a processed variant is stored. */
  async evictRawBlob(attachmentId: string): Promise<boolean> {
    const rawKey = makeBlobKey(attachmentId, 'raw');
    try {
      // Never evict raw without a durable variant stored: a resource with no cloud key would become unresolvable.
      const hasDurable =
        (await this.hasVariant(attachmentId, 'original')) || (await this.hasVariant(attachmentId, 'converted'));
      if (!hasDurable) {
        console.debug(`[AttachmentStorage] Skipped raw eviction for ${attachmentId}: no durable variant stored`);
        return false;
      }

      const exists = await attachmentsDb.blobs.get(rawKey);
      if (exists) {
        await attachmentsDb.blobs.delete(rawKey);
        // A shared URL may have fallen back to the removed raw blob.
        this.invalidateSharedBlobUrls(attachmentId);
        console.debug(`[AttachmentStorage] Evicted raw blob for ${attachmentId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[AttachmentStorage] Failed to evict raw blob (${attachmentId}):`, error);
      return false;
    }
  }

  /** Single primary-key lookup on the composite key. */
  async hasVariant(attachmentId: string, variant: BlobVariant): Promise<boolean> {
    try {
      const key = makeBlobKey(attachmentId, variant);
      const exists = await attachmentsDb.blobs.get(key);
      return !!exists;
    } catch {
      return false;
    }
  }

  async getStoredVariants(attachmentId: string): Promise<BlobVariant[]> {
    try {
      const blobs = await attachmentsDb.blobs.where('attachmentId').equals(attachmentId).toArray();
      return blobs.map((b) => b.variant);
    } catch {
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
    if (!file.data || !(file.data instanceof Blob)) {
      throw new Error('File data must be a Blob');
    }

    const blobData = file.data;
    const size = file.size ?? blobData.size ?? 0;

    // Fall back to file.id while no attachment id exists yet.
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
      uploadAttempts: 0,
      nextRetryAt: null,
      lastError: null,
      storedAt: new Date(),
    };

    try {
      await attachmentsDb.blobs.add(blob);
      this.invalidateSharedBlobUrls(actualAttachmentId);
      return blob;
    } catch (error) {
      console.error('[AttachmentStorage] Failed to store upload blob:', error);
      throw error;
    }
  }

  /** Get a blob by composite key (`id:variant`). */
  private async getBlob(id: string): Promise<AttachmentBlob | undefined> {
    try {
      return await attachmentsDb.blobs.get(id);
    } catch (error) {
      console.error(`[AttachmentStorage] Failed to get blob (${id}):`, error);
      return undefined;
    }
  }

  /** Delete every variant blob of each attachment id. */
  async deleteBlobs(ids: string[]): Promise<void> {
    try {
      for (const id of ids) {
        await attachmentsDb.blobs.where('attachmentId').equals(id).delete();
        this.invalidateSharedBlobUrls(id);
      }
    } catch (error) {
      console.error('[AttachmentStorage] Failed to delete blobs:', error);
      throw error;
    }
  }

  async updateUploadStatus(id: string, status: UploadStatus, error?: string): Promise<void> {
    try {
      const updates: Partial<AttachmentBlob> = { uploadStatus: status };

      // Every failure bumps the attempt count and schedules the next retry slot, which the upload-service retry selector reads.
      if (status === 'failed') {
        const blob = await attachmentsDb.blobs.get(id);
        if (blob) {
          const attempts = blob.uploadAttempts ?? 0;
          updates.uploadAttempts = attempts + 1;
          updates.lastError = error ?? blob.lastError ?? 'Upload failed';

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
      console.error(`[AttachmentStorage] Failed to update upload status (${id}):`, error);
      throw error;
    }
  }

  async markUploaded(id: string): Promise<void> {
    await this.updateUploadStatus(id, 'uploaded');
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.updateUploadStatus(id, 'failed', error);
  }

  /** Get total storage used by blobs for an organization. */
  async getStorageUsed(organizationId: string): Promise<number> {
    try {
      const blobs = await attachmentsDb.blobs.where('organizationId').equals(organizationId).toArray();
      return blobs.reduce((total, blob) => total + blob.size, 0);
    } catch {
      return 0;
    }
  }
}

/** Stores upload/download blobs and exposes blob URLs for attachment rendering. */
export const attachmentStorage = new AttachmentStorageService();
