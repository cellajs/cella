import type { Attachment } from 'sdk';
import {
  type CloudFileVariant,
  getCloudUrl,
  getPrivateFileUrlById,
  getPublicFileUrl,
  getVariantKey,
} from '~/modules/attachment/file-url';
import type { BlobVariant } from '~/modules/attachment/offline/attachments-db';
import { downloadService } from '~/modules/attachment/offline/download-service';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { findAttachmentInCache } from '~/modules/attachment/query';

interface ResolvedUrl {
  url: string;
  isLocal: boolean;
  variant: BlobVariant | null;
}

export interface ResolveOptions {
  preferredVariant?: BlobVariant;
}

/** Cloud-key fields needed to build a URL without consulting the react-query cache. */
type AttachmentMeta = Pick<Attachment, 'keys' | 'publicBucket' | 'organizationId' | 'tenantId'>;

/** Local blob first, then cloud; a cloud hit queues a background download so the next view is served locally. */
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

  // Requested variant only when its key exists; private files pass id + variant since client keys are not trusted.
  const effectiveVariant =
    preferredVariant !== 'raw' && getVariantKey(meta, preferredVariant) ? preferredVariant : 'original';
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
 * Resolves slashed public keys through the CDN and attachment ids through local storage or a presigned URL, or '' when unresolvable.
 * Local blob URLs come from the storage service's shared cache, so a ref keeps one stable URL and the service owns revocation.
 */
export async function resolveBlockNoteFileRef(ref: string, ctx: RefContext = {}): Promise<string> {
  if (!ref.length) return '';

  // Attachment ids are UUIDs; public cloud keys contain slashes and already point at the preview key stored at upload time.
  if (ref.includes('/')) return getPublicFileUrl(ref);

  // Inline images use the mid-size preview; video, audio and documents keep the converted variant to stay playable.
  const cached = findAttachmentInCache(ref);
  const variant: CloudFileVariant = cached?.contentType?.startsWith('image/') ? 'preview' : 'converted';

  const localUrl = await attachmentStorage.getSharedBlobUrl(ref, variant, true);
  if (localUrl) return localUrl;

  const tenantId = cached?.tenantId ?? ctx.tenantId;
  const organizationId = cached?.organizationId ?? ctx.organizationId;
  if (!tenantId || !organizationId) {
    console.error('[BlockNote] Cannot resolve private file URL: no tenantId/organizationId for id:', ref);
    return '';
  }

  return getPrivateFileUrlById(ref, variant, tenantId, organizationId);
}
