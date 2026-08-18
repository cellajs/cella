import { onlineManager } from '@tanstack/react-query';
import { Uppy } from '@uppy/core';
import Transloadit from '@uppy/transloadit';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher inside Uppy assembly callback, not eligible for a React Query hook.
import { getUploadToken } from 'sdk';
import { appConfig } from 'shared';
import { reportCriticalError } from '~/lib/tracing';
import { type AttachmentBlob, attachmentsDb } from '~/modules/attachment/offline/attachments-db';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { isUploadCandidate } from '~/modules/attachment/offline/upload-retry';
import { getLocalUserDb } from '~/query/local-user-db';

/** Uploads pending local blobs to cloud on a timer and on reconnect, through headless Uppy + Transloadit (Tus resumable, lazy per-upload token). */
class AttachmentUploadService {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: (() => void) | null = null;

  start(): void {
    this.onlineHandler = () => this.processPendingUploads();
    window.addEventListener('online', this.onlineHandler);

    this.intervalId = setInterval(() => this.processPendingUploads(), 60000);

    this.processPendingUploads();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  async processPendingUploads(): Promise<void> {
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;
    if (!getLocalUserDb()) return; // Signed out, no per-user blob store to process.

    this.processing = true;

    try {
      const pending = await this.selectUploadCandidates();
      if (pending.length === 0) return;

      const byOrg = new Map<string, AttachmentBlob[]>();
      for (const blob of pending) {
        const existing = byOrg.get(blob.organizationId) || [];
        existing.push(blob);
        byOrg.set(blob.organizationId, existing);
      }

      for (const [organizationId, blobs] of byOrg) {
        await this.uploadOrganizationBlobs(organizationId, blobs);
      }
    } catch (error) {
      console.error('[UploadService] Upload run failed:', error);
      reportCriticalError('attachment.upload_failed', error);
    } finally {
      this.processing = false;
    }
  }

  /** Blobs eligible for an upload attempt now (see isUploadCandidate). */
  private async selectUploadCandidates(): Promise<AttachmentBlob[]> {
    const retryLimit = appConfig.localBlobStorage?.uploadRetryAttempts ?? 3;
    const now = Date.now();
    const candidates = await attachmentsDb.blobs.where('uploadStatus').anyOf('pending', 'failed').toArray();
    return candidates.filter((blob) => isUploadCandidate(blob, retryLimit, now));
  }

  private async checkCloudAvailability(organizationId: string): Promise<boolean> {
    try {
      const token = await getUploadToken({
        query: { publicBucket: false, templateId: 'attachment', organizationId },
      });
      return !!(token?.params && token?.signature);
    } catch {
      return false;
    }
  }

  /** Upload blobs for a specific organization. Each blob gets a fresh token via lazy assemblyOptions. */
  private async uploadOrganizationBlobs(organizationId: string, blobs: AttachmentBlob[]): Promise<void> {
    const cloudAvailable = await this.checkCloudAvailability(organizationId);

    if (!cloudAvailable) {
      for (const blob of blobs) {
        await attachmentStorage.updateUploadStatus(blob.id, 'local-only');
      }
      return;
    }

    for (const blob of blobs) {
      try {
        await this.uploadBlob(blob);
      } catch (error) {
        console.error(`[UploadService] Failed to upload blob ${blob.id}:`, error);
        await attachmentStorage.markFailed(blob.id, error instanceof Error ? error.message : 'Upload failed');
      }
    }
  }

  private async uploadBlob(blob: AttachmentBlob): Promise<void> {
    await attachmentStorage.updateUploadStatus(blob.id, 'uploading');

    const uppy = new Uppy({
      autoProceed: false,
      allowMultipleUploadBatches: false,
    });

    try {
      uppy.use(Transloadit, {
        waitForEncoding: true,
        alwaysRunAssembly: true,
        assemblyOptions: async () => {
          const token = await getUploadToken({
            query: {
              publicBucket: blob.uploadContext?.publicBucket ?? false,
              templateId: blob.uploadContext?.templateId ?? 'attachment',
              organizationId: blob.organizationId,
            },
          });

          if (!token?.params || !token?.signature) {
            throw new Error('Failed to get upload token');
          }

          return { params: token.params, signature: token.signature };
        },
      });

      uppy.addFile({
        name: blob.filename || `${blob.id}.bin`,
        type: blob.contentType,
        data: blob.blob,
        meta: { attachmentId: blob.id },
      });

      const result = await uppy.upload();

      if (!result) {
        await attachmentStorage.markFailed(blob.id, 'Upload returned no result');
        return;
      }

      if (result.successful && result.successful.length > 0) {
        await attachmentStorage.markUploaded(blob.id);
      } else if (result.failed && result.failed.length > 0) {
        const file = result.failed[0];
        const errorMsg = typeof file.error === 'string' ? file.error : 'Upload failed';
        await attachmentStorage.markFailed(blob.id, errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await attachmentStorage.markFailed(blob.id, errorMsg);
      console.error(`[UploadService] Blob ${blob.id} error:`, error);
    } finally {
      uppy.destroy();
    }
  }
}

/** Coordinates queued and retried attachment uploads. */
export const uploadService = new AttachmentUploadService();
