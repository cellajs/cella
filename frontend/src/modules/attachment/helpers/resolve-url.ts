import type { Attachment } from 'sdk';
import { getCloudUrl, getVariantKey } from '~/modules/attachment/file-url';
import type { BlobVariant } from '~/modules/attachment/offline/attachments-db';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { findAttachmentInCache } from '~/modules/attachment/query';

/** Result of resolving an attachment URL */
interface ResolvedUrl {
  url: string;
  isLocal: boolean;
  variant: BlobVariant | null;
}

export interface ResolveOptions {
  preferredVariant?: BlobVariant;
}

/** Cloud-key fields needed to build a URL without consulting the react-query cache. */
type AttachmentMeta = Pick<
  Attachment,
  'originalKey' | 'convertedKey' | 'thumbnailKey' | 'public' | 'organizationId' | 'tenantId'
>;

/**
 * Core URL resolution: local blob first, then cloud fallback. Pure — no React hooks.
 *
 * Resolving a cloud URL also queues the attachment for background download, so the next view of
 * the same file can be served locally.
 */
export async function resolveAttachmentUrl(
  attachmentId: string,
  attachment: AttachmentMeta | null,
  options: ResolveOptions = {},
): Promise<ResolvedUrl | null> {
  const { preferredVariant = 'original' } = options;

  // 1. Try local blob first.
  const localResult = await attachmentStorage.createBlobUrlWithVariant(attachmentId, preferredVariant, true);
  if (localResult) {
    return { url: localResult.url, isLocal: true, variant: localResult.actualVariant };
  }

  // 2. Need attachment metadata for cloud URL - try list and detail cache
  const meta = attachment ?? findAttachmentInCache(attachmentId);
  if (!meta) return null;

  // 3. Cloud URL: use the requested variant only if its key exists, else fall back to original.
  // Private files are referenced by id + variant so the server signs the key — never a client key.
  const effectiveVariant =
    preferredVariant !== 'raw' && getVariantKey(meta, preferredVariant) ? preferredVariant : 'original';
  const fileUrl = await getCloudUrl({ ...meta, id: attachmentId }, effectiveVariant);
  if (!fileUrl) return null;

  // 4. Queue for background download
  const fullAttachment = findAttachmentInCache(attachmentId);
  if (fullAttachment) downloadService.queueForDownload([fullAttachment]);

  return { url: fileUrl, isLocal: false, variant: null };
}
