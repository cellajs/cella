import type { Attachment } from 'sdk';
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

    for (const candidate of chain) {
      const blob = await this.getBlob(makeBlobKey(attachmentId, candidate));
      if (blob) {
        return { blob, actualVariant: candidate };
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
      const hasDurable = (await this.hasVariant(attachmentId, 'original')) || (await this.hasVariant(attachmentId, 'converted'));
      if (!hasDurable) {
        console.debug(`[AttachmentStorage] Skipped raw eviction for ${attachmentId}: no durable variant stored`);
        return false;
      }

      const rawBlob = await attachmentsDb.blobs.get(rawKey);
      if (rawBlob) {
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

  async hasVariant(attachmentId: string, variant: BlobVariant): Promise<boolean> {
    try {
      const blob = await attachmentsDb.blobs.get(makeBlobKey(attachmentId, variant));
      return !!blob;
    } catch {
      return false;
    }
  }

  async getStoredVariants(attachmentId: string): Promise<BlobVariant[]> {
    try {
      const blobs = await attachmentsDb.blobs.where('attachmentId').equals(attachmentId).toArray();
      return blobs.map((blob) => blob.variant);
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

    const blob = file.data;
    const size = file.size ?? blob.size ?? 0;

    // Fall back to file.id while no attachment id exists yet.
    const actualAttachmentId = attachmentId || file.id;
    const key = makeBlobKey(actualAttachmentId, 'raw');

    const record: AttachmentBlob = {
      id: key,
      attachmentId: actualAttachmentId,
      variant: 'raw',
      organizationId,
      blob,
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
      await attachmentsDb.blobs.add(record);
      this.invalidateSharedBlobUrls(actualAttachmentId);
      return record;
    } catch (error) {
      console.error('[AttachmentStorage] Failed to store upload blob:', error);
      throw error;
    }
  }

  /** Get a blob by composite key (`attachmentId:variant`). */
  private async getBlob(blobKey: string): Promise<AttachmentBlob | undefined> {
    try {
      return await attachmentsDb.blobs.get(blobKey);
    } catch (error) {
      console.error(`[AttachmentStorage] Failed to get blob (${blobKey}):`, error);
      return undefined;
    }
  }

  /** Delete every variant blob of each attachment id. */
  async deleteBlobs(attachmentIds: string[]): Promise<void> {
    try {
      for (const attachmentId of attachmentIds) {
        await attachmentsDb.blobs.where('attachmentId').equals(attachmentId).delete();
        this.invalidateSharedBlobUrls(attachmentId);
      }
    } catch (error) {
      console.error('[AttachmentStorage] Failed to delete blobs:', error);
      throw error;
    }
  }

  async updateUploadStatus(blobKey: string, status: UploadStatus, error?: string): Promise<void> {
    try {
      const updates: Partial<AttachmentBlob> = { uploadStatus: status };

      // Every failure bumps the attempt count and schedules the next retry slot, which the upload-service retry selector reads.
      if (status === 'failed') {
        const blob = await attachmentsDb.blobs.get(blobKey);
        if (blob) {
          const attempts = blob.uploadAttempts ?? 0;
          updates.uploadAttempts = attempts + 1;
          updates.lastError = error ?? blob.lastError ?? 'Upload failed';

          const delays = appConfig.localBlobStorage.uploadRetryDelays;
          const delay = delays[Math.min(attempts, delays.length - 1)];
          updates.nextRetryAt = new Date(Date.now() + delay);
        }
      }

      if (status === 'uploaded') {
        updates.lastError = null;
        updates.nextRetryAt = null;
      }

      await attachmentsDb.blobs.update(blobKey, updates);
    } catch (error) {
      console.error(`[AttachmentStorage] Failed to update upload status (${blobKey}):`, error);
      throw error;
    }
  }

  async markUploaded(blobKey: string): Promise<void> {
    await this.updateUploadStatus(blobKey, 'uploaded');
  }

  async markFailed(blobKey: string, error: string): Promise<void> {
    await this.updateUploadStatus(blobKey, 'failed', error);
  }

  /** Marks a deferred upload uploaded, keeping its stored keys on the blob until the attachment row has them. */
  async markUploadedWithKeys(blobKey: string, cloudKeys: Attachment['keys'], cloudConvertedContentType: string | null): Promise<void> {
    await attachmentsDb.blobs.update(blobKey, { cloudKeys, cloudConvertedContentType, keysLinkedAt: null, linkAttempts: 0 });
    await this.markUploaded(blobKey);
  }

  /** Uploaded blobs whose attachment row still lacks their keys, while attempts remain. */
  async getUnlinkedUploads(maxAttempts: number): Promise<AttachmentBlob[]> {
    return attachmentsDb.blobs
      .where('uploadStatus')
      .equals('uploaded')
      .filter((blob) => !!blob.cloudKeys && !blob.keysLinkedAt && (blob.linkAttempts ?? 0) < maxAttempts)
      .toArray();
  }

  async markKeysLinked(blobKey: string): Promise<void> {
    await attachmentsDb.blobs.update(blobKey, { keysLinkedAt: new Date(), lastError: null });
  }

  async recordLinkFailure(blobKey: string, error: string, attempts: number): Promise<void> {
    await attachmentsDb.blobs.update(blobKey, { linkAttempts: attempts, lastError: error });
  }

  /** Bytes the organization's stored blobs take on this device. */
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
