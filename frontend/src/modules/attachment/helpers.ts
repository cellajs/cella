import { appConfig } from 'shared';
import { uploadTemplates } from 'shared/upload-templates';
import type { Attachment } from '~/api.gen';
import { getPresignedUrl } from '~/api.gen/sdk.gen';
import { zAttachment } from '~/api.gen/zod.gen';
import type { BlobVariant } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { downloadService } from '~/modules/attachment/download-service';
import { findAttachmentInListCache } from '~/modules/attachment/query';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { createOptimisticEntity } from '~/query/basic';
import { nanoid } from '~/utils/nanoid';

/**
 * Constructs a public CDN URL for a file key.
 * Use for public files to avoid the presigned URL endpoint.
 */
export function getPublicFileUrl(key: string): string {
  return `${appConfig.s3.publicCDNUrl}/${key}`;
}

/**
 * Gets the URL for a file based on its public/private status.
 * Public files use direct CDN URL, private files use presigned URL endpoint.
 */
export async function getFileUrl(key: string, isPublic: boolean): Promise<string> {
  if (isPublic) {
    return getPublicFileUrl(key);
  }
  return getPresignedUrl({ query: { key } });
}

/** Result of resolving an attachment URL */
export interface ResolvedUrl {
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
  attachment: Pick<Attachment, 'originalKey' | 'convertedKey' | 'thumbnailKey' | 'public'> | null,
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

  // 2. Need attachment metadata for cloud URL - try cache if not provided
  const meta = attachment ?? findAttachmentInListCache(attachmentId);
  if (!meta) return null;

  // 3. Get cloud presigned URL
  const cloudKey =
    preferredVariant === 'thumbnail' && meta.thumbnailKey
      ? meta.thumbnailKey
      : preferredVariant === 'converted' && meta.convertedKey
        ? meta.convertedKey
        : meta.originalKey;

  if (!cloudKey) return null;

  const fileUrl = await getFileUrl(cloudKey, meta.public);

  // 4. Queue for background download
  if (queueDownload) {
    const fullAttachment = findAttachmentInListCache(attachmentId);
    if (fullAttachment) downloadService.queueForDownload([fullAttachment]);
  }

  return { url: fileUrl, isLocal: false, variant: null };
}

export const parseUploadedAttachments = (
  result: UploadedUppyFile<'attachment'>,
  organizationId: string,
): Attachment[] => {
  // Process original files
  const originalFiles = result[':original'] ?? [];

  const attachmentsById = new Map<string, Attachment>();
  const groupId = originalFiles.length > 1 ? nanoid() : null;

  for (const file of originalFiles) {
    const { size, url, mime, original_name, original_id, user_meta } = file;

    // Handle original_id being string or string[] from Transloadit
    const id = (Array.isArray(original_id) ? original_id[0] : original_id) || nanoid();

    const filename = original_name || user_meta?.name || 'file';
    const extIndex = filename.lastIndexOf('.');
    const name = extIndex > 0 ? filename.substring(0, extIndex) : filename;

    // Use createOptimisticEntity to get schema defaults (including placeholder tx)
    const attachment = createOptimisticEntity(zAttachment, {
      size: String(size ?? 0),
      contentType: mime ?? 'application/octet-stream',
      filename,
      name,
      description: '',
      public: user_meta?.public === 'true',
      bucketName: user_meta?.bucketName,
      originalKey: url ?? '',
      groupId,
      organizationId,
    });

    // Override the temp id with the upload-provided id
    attachment.id = id;

    attachmentsById.set(id, attachment);
  }

  //  Process converted + thumbnail variants
  const steps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

  for (const step of steps) {
    const files = result[step] ?? [];

    for (const { url, mime, original_id } of files) {
      if (!original_id) continue;

      // Handle original_id being string or string[] from Transloadit
      const resolvedId = Array.isArray(original_id) ? original_id[0] : original_id;
      const target = attachmentsById.get(resolvedId);
      if (!target) continue;

      if (step.startsWith('converted_')) {
        target.convertedKey = url ?? null;
        target.convertedContentType = mime ?? null;
      }

      if (step.startsWith('thumb_')) {
        target.thumbnailKey = url ?? null;
      }
    }
  }

  return Array.from(attachmentsById.values());
};
