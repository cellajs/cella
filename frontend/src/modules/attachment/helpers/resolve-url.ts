import type { Attachment } from 'sdk';
import type { BlobVariant } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { downloadService } from '~/modules/attachment/download-service';
import { getFileUrl } from '~/modules/attachment/file-url';
import { findAttachmentInCache } from '~/modules/attachment/query';

/** Result of resolving an attachment URL */
interface ResolvedUrl {
  url: string;
  isLocal: boolean;
  variant: BlobVariant | null;
}

export interface ResolveOptions {
  preferredVariant?: BlobVariant;
  useFallback?: boolean;
  preferCloud?: boolean;
  queueDownload?: boolean;
}

/**
 * Core URL resolution: local blob first, then cloud fallback.
 * Pure async function - no React hooks.
 *
 * @returns Resolved URL info, or null if not resolvable
 */
export async function resolveAttachmentUrl(
  attachmentId: string,
  attachment: Pick<
    Attachment,
    'originalKey' | 'convertedKey' | 'thumbnailKey' | 'public' | 'organizationId' | 'tenantId'
  > | null,
  options: ResolveOptions = {},
): Promise<ResolvedUrl | null> {
  const { preferredVariant = 'original', useFallback = true, preferCloud = false, queueDownload = true } = options;

  // 1. Try local blob first (unless preferCloud)
  if (!preferCloud) {
    const localResult = await attachmentStorage.createBlobUrlWithVariant(attachmentId, preferredVariant, useFallback);
    if (localResult) {
      return { url: localResult.url, isLocal: true, variant: localResult.actualVariant };
    }
  }

  // 2. Need attachment metadata for cloud URL - try list and detail cache
  const meta = attachment ?? findAttachmentInCache(attachmentId);
  if (!meta) return null;

  // 3. Get cloud presigned URL
  const cloudKey =
    preferredVariant === 'thumbnail' && meta.thumbnailKey
      ? meta.thumbnailKey
      : preferredVariant === 'converted' && meta.convertedKey
        ? meta.convertedKey
        : meta.originalKey;

  if (!cloudKey) return null;

  const fileUrl = await getFileUrl(cloudKey, meta.public, meta.tenantId, meta.organizationId);

  // 4. Queue for background download
  if (queueDownload) {
    const fullAttachment = findAttachmentInCache(attachmentId);
    if (fullAttachment) downloadService.queueForDownload([fullAttachment]);
  }

  return { url: fileUrl, isLocal: false, variant: null };
}
