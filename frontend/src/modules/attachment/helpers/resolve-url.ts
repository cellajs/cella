import type { Attachment } from 'sdk';
import type { BlobVariant } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { downloadService } from '~/modules/attachment/download-service';
import { getPrivateFileUrlById, getPublicFileUrl } from '~/modules/attachment/file-url';
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

/** Core URL resolution: local blob first, then cloud fallback. Pure — no React hooks. */
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

  // 3. Cloud URL: pick the requested variant only if its key exists (else original), and
  // reference private files by id + variant so the server signs the key — never a client key.
  const effectiveVariant =
    preferredVariant === 'thumbnail' && meta.thumbnailKey
      ? 'thumbnail'
      : preferredVariant === 'converted' && meta.convertedKey
        ? 'converted'
        : 'original';

  const cloudKey =
    effectiveVariant === 'thumbnail'
      ? meta.thumbnailKey
      : effectiveVariant === 'converted'
        ? meta.convertedKey
        : meta.originalKey;

  if (!cloudKey) return null;

  // Public files build the CDN URL from the key directly; private files are signed by id.
  const fileUrl = meta.public
    ? getPublicFileUrl(cloudKey)
    : await getPrivateFileUrlById(attachmentId, effectiveVariant, meta.tenantId, meta.organizationId);

  // 4. Queue for background download
  if (queueDownload) {
    const fullAttachment = findAttachmentInCache(attachmentId);
    if (fullAttachment) downloadService.queueForDownload([fullAttachment]);
  }

  return { url: fileUrl, isLocal: false, variant: null };
}
