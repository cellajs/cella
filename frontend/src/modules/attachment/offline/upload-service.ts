import { onlineManager } from '@tanstack/react-query';
import { Uppy } from '@uppy/core';
import Transloadit, { type AssemblyResponse } from '@uppy/transloadit';
// biome-ignore lint/style/noRestrictedImports: runtime calls of a background service (token fetch inside the Uppy assembly callback, key link), not eligible for a React Query hook.
import { getUploadToken, linkAttachmentKeys } from 'sdk';
import { appConfig } from 'shared';
import { ApiError } from '~/lib/api';
import { reportCriticalError } from '~/lib/tracing';
import { uploadedFileKeys } from '~/modules/attachment/helpers/parse-uploaded';
import { type AttachmentBlob, attachmentsDb } from '~/modules/attachment/offline/attachments-db';
import { groupBy } from '~/modules/attachment/offline/group-by';
import { isUploadCandidate } from '~/modules/attachment/offline/is-upload-candidate';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { findAttachmentInCache } from '~/modules/attachment/query';
import type { UploadResults } from '~/modules/common/uploader/types';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { getLocalUserDb } from '~/query/local-user-db';
import { queryClient } from '~/query/query-client';
import { getTenantIdForOrg } from '~/query/realtime/sync-priority';

/** Attempts to link an uploaded blob's keys to its row; a 404 waits for a create still queued offline. */
const linkAttemptLimit = 10;

const uploadIntervalMs = 60_000;

type CloudAvailability = 'available' | 'unconfigured' | 'unreachable';

/**
 * Uploads pending local blobs to cloud on a timer and on reconnect, through headless Uppy + Transloadit (Tus resumable, lazy
 * per-upload token), then links the stored keys to the attachment row so other devices can fetch the file.
 */
class AttachmentUploadService {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineUnsubscribe: (() => void) | null = null;

  start(): void {
    this.onlineUnsubscribe = onlineManager.subscribe((online) => {
      if (online) this.processPendingUploads();
    });
    this.intervalId = setInterval(() => this.processPendingUploads(), uploadIntervalMs);
    this.processPendingUploads();
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.onlineUnsubscribe?.();
    this.onlineUnsubscribe = null;
  }

  async processPendingUploads(): Promise<void> {
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;
    if (!getLocalUserDb()) return; // Signed out, no per-user blob store to process.

    this.processing = true;

    try {
      for (const blob of await attachmentStorage.getUnlinkedUploads(linkAttemptLimit)) await this.linkBlobKeys(blob);

      const pending = await this.selectUploadCandidates();
      if (pending.length === 0) return;

      for (const [organizationId, blobs] of groupBy(pending, (blob) => blob.organizationId)) {
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
    const retryLimit = appConfig.localBlobStorage.uploadRetryAttempts;
    const now = Date.now();
    const candidates = await attachmentsDb.blobs.where('uploadStatus').anyOf('pending', 'failed').toArray();
    return candidates.filter((blob) => isUploadCandidate(blob, retryLimit, now));
  }

  private async checkCloudAvailability(organizationId: string): Promise<CloudAvailability> {
    try {
      const token = await getUploadToken({ query: { templateId: 'attachment', organizationId } });
      return token?.params && token?.signature ? 'available' : 'unconfigured';
    } catch {
      return 'unreachable';
    }
  }

  /** Upload blobs for a specific organization. Each blob gets a fresh token via lazy assemblyOptions. */
  private async uploadOrganizationBlobs(organizationId: string, blobs: AttachmentBlob[]): Promise<void> {
    const availability = await this.checkCloudAvailability(organizationId);
    // An unreachable server says nothing about cloud storage: the blobs stay pending for the next run.
    if (availability === 'unreachable') return;

    if (availability === 'unconfigured') {
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

    const uppy = new Uppy({ autoProceed: false, allowMultipleUploadBatches: false });
    const completed: { assembly?: AssemblyResponse } = {};
    const templateId = blob.uploadContext?.templateId ?? 'attachment';

    try {
      uppy.use(Transloadit, {
        waitForEncoding: true,
        alwaysRunAssembly: true,
        assemblyOptions: async () => {
          const token = await getUploadToken({ query: { templateId, organizationId: blob.organizationId } });

          if (!token?.params || !token?.signature) {
            throw new Error('Failed to get upload token');
          }

          return { params: token.params, signature: token.signature };
        },
      });
      uppy.on('transloadit:complete', (assembly) => {
        completed.assembly = assembly;
      });

      uppy.addFile({ name: blob.filename || `${blob.id}.bin`, type: blob.contentType, data: blob.blob, meta: { attachmentId: blob.attachmentId } });

      const result = await uppy.upload();

      if (!result) {
        await attachmentStorage.markFailed(blob.id, 'Upload returned no result');
        return;
      }

      if (result.successful && result.successful.length > 0) {
        const results = completed.assembly?.results as UploadResults<'attachment'> | undefined;
        const [original] = results?.[':original'] ?? [];
        // Only the attachment template has a row to link; other templates' files are referenced by their own forms.
        if (templateId !== 'attachment' || !results || !original) {
          await attachmentStorage.markUploaded(blob.id);
          return;
        }

        const { keys, convertedContentType } = uploadedFileKeys(results, original);
        await attachmentStorage.markUploadedWithKeys(blob.id, keys, convertedContentType);
        await this.linkBlobKeys({ ...blob, cloudKeys: keys, cloudConvertedContentType: convertedContentType, linkAttempts: 0 });
      } else if (result.failed && result.failed.length > 0) {
        const file = result.failed[0];
        const errorMessage = typeof file.error === 'string' ? file.error : 'Upload failed';
        await attachmentStorage.markFailed(blob.id, errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await attachmentStorage.markFailed(blob.id, errorMessage);
      console.error(`[UploadService] Blob ${blob.id} error:`, error);
    } finally {
      uppy.destroy();
    }
  }

  /** Writes an uploaded blob's keys to its attachment row; the server's row then reaches every cache through sync. */
  private async linkBlobKeys(blob: AttachmentBlob): Promise<void> {
    const tenantId = findAttachmentInCache(blob.attachmentId)?.tenantId ?? getTenantIdForOrg(blob.organizationId);
    if (!blob.cloudKeys || !tenantId) return;

    try {
      const attachment = await linkAttachmentKeys({
        path: { tenantId, organizationId: blob.organizationId, id: blob.attachmentId },
        body: { keys: blob.cloudKeys, convertedContentType: blob.cloudConvertedContentType ?? null },
      });
      await attachmentStorage.markKeysLinked(blob.id);
      insertEntitiesIntoHome(queryClient, [attachment]);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : null;
      // The row already holds a stored file, which other devices can fetch.
      if (status === 409) return attachmentStorage.markKeysLinked(blob.id);

      // A 404 can be a create still queued offline; any other refusal stays a refusal.
      const isPermanent = status !== null && status !== 404 && status < 500;
      const attempts = isPermanent ? linkAttemptLimit : (blob.linkAttempts ?? 0) + 1;
      await attachmentStorage.recordLinkFailure(blob.id, error instanceof Error ? error.message : 'Link failed', attempts);
    }
  }
}

/** Coordinates queued and retried attachment uploads. */
export const uploadService = new AttachmentUploadService();
