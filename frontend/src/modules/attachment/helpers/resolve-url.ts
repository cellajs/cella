import type { Attachment } from 'sdk';
import { parseMediaRef } from 'shared/utils/media-ref';
import { type CloudFileVariant, getCloudUrl, getPublicFileUrl, getVariantKey } from '~/modules/attachment/file-url';
import { isPendingUpload, markPendingUpload, PendingUploadError } from '~/modules/attachment/helpers/pending-uploads';
import type { BlobVariant } from '~/modules/attachment/offline/attachments-db';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { getPresignedUrlBatched, PresignRejectedError } from '~/modules/attachment/presign-batch';
import { fetchAttachment, findAttachmentInCache } from '~/modules/attachment/query';

interface ResolvedUrl {
  url: string;
  isLocal: boolean;
  variant: BlobVariant | null;
}

export interface ResolveOptions {
  preferredVariant?: BlobVariant;
}

/** Cloud-key fields needed to build a URL without consulting the react-query cache. */
export type AttachmentMeta = Pick<Attachment, 'keys' | 'publicBucket' | 'organizationId' | 'tenantId'> & Partial<Pick<Attachment, 'createdBy'>>;

/**
 * Local blob first, then cloud; a cloud hit queues a background download so the next view is served locally. Throws
 * `PendingUploadError` for a file still only on its uploader's device.
 */
export async function resolveAttachmentUrl(
  attachmentId: string,
  attachment: AttachmentMeta | null,
  options: ResolveOptions = {},
): Promise<ResolvedUrl | null> {
  const { preferredVariant = 'original' } = options;

  const localResult = await attachmentStorage.createBlobUrlWithVariant(attachmentId, preferredVariant, true);
  if (localResult) {
    return { url: localResult.url, isLocal: true, variant: localResult.actualVariant };
  }

  const meta = attachment ?? findAttachmentInCache(attachmentId);
  if (!meta) return null;

  if (isPendingUpload(meta)) {
    markPendingUpload(attachmentId, meta.createdBy ?? findAttachmentInCache(attachmentId)?.createdBy ?? null);
    throw new PendingUploadError(attachmentId);
  }

  // Requested variant only when its key exists; private files pass id + variant since client keys are not trusted.
  const effectiveVariant = preferredVariant !== 'raw' && getVariantKey(meta, preferredVariant) ? preferredVariant : 'original';
  const fileUrl = await getCloudUrl({ ...meta, id: attachmentId }, effectiveVariant);
  if (!fileUrl) return null;

  const fullAttachment = findAttachmentInCache(attachmentId);
  if (fullAttachment) downloadService.queueForDownload([fullAttachment]);

  return { url: fileUrl, isLocal: false, variant: null };
}

/** Org context a block reference falls back to when the attachment isn't in cache. */
interface RefContext {
  tenantId?: string;
  organizationId?: string;
}

/**
 * Resolves a media block reference by its media grammar kind, or '' when it renders nothing: an attachment id through
 * local storage or a presigned URL, a key under the document's organization through the CDN, an asset URL as stored.
 * Local blob URLs come from the storage service's shared cache, so a ref keeps one stable URL and the service owns revocation.
 * A file still only on its uploader's device also resolves to '', registered in `pending-uploads` for its placeholder.
 */
export async function resolveBlockNoteFileRef(ref: string, ctx: RefContext = {}): Promise<string> {
  // Stored documents and Yjs updates are client input: a non-string would reach the renderer coerced to a URL.
  if (typeof ref !== 'string' || !ref.length) return '';

  const media = parseMediaRef(ref, { organizationId: ctx.organizationId });
  if (media.kind === 'invalid') return '';
  if (media.kind === 'asset') return media.url;
  // Public keys already point at the preview key stored at upload time.
  if (media.kind === 'orgKey') return getPublicFileUrl(media.key);

  // Inline images use the mid-size preview; video, audio and documents keep the converted variant to stay playable.
  const cached = findAttachmentInCache(media.id);
  const variant: CloudFileVariant = cached?.contentType?.startsWith('image/') ? 'preview' : 'converted';

  const localUrl = await attachmentStorage.getSharedBlobUrl(media.id, variant, true);
  if (localUrl) return localUrl;

  if (cached && isPendingUpload(cached)) {
    markPendingUpload(media.id, cached.createdBy);
    return '';
  }

  const tenantId = cached?.tenantId ?? ctx.tenantId;
  const organizationId = cached?.organizationId ?? ctx.organizationId;
  if (!tenantId || !organizationId) {
    console.error('[BlockNote] Cannot resolve private file URL: no tenantId/organizationId for id:', media.id);
    return '';
  }

  // A row that is gone or denied renders nothing, as an invalid reference does; a failed request stays an error.
  return getPresignedUrlBatched(media.id, variant, tenantId, organizationId).catch(async (error) => {
    if (!(error instanceof PresignRejectedError)) throw error;
    // An uncached row may be readable but not uploaded yet: the permission-checked read tells it apart from gone or denied.
    const row = await fetchAttachment(tenantId, organizationId, media.id);
    if (row && isPendingUpload(row)) markPendingUpload(media.id, row.createdBy);
    return '';
  });
}
