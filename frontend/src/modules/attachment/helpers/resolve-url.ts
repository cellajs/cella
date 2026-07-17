import type { Attachment } from 'sdk';
import { getCloudUrl, getPrivateFileUrlById, getPublicFileUrl, getVariantKey } from '~/modules/attachment/file-url';
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

/** Org context a block reference falls back to when the attachment isn't in cache. */
interface RefContext {
  tenantId?: string;
  organizationId?: string;
}

/**
 * Resolve a BlockNote block's file reference. The reference alone decides how — no public/private
 * flag needed:
 * - a **UUID attachment id** (no slashes) → private media: local blob first, else a presigned URL
 *   by id + variant (permission-checked server-side);
 * - a **slashed cloud key** → public media, straight from the CDN.
 *
 * Returns `''` for anything unresolvable, which renders an empty `src` rather than firing a
 * request at a bogus URL.
 *
 * NOTE: a local hit returns an object URL this function cannot revoke — it has no lifecycle to
 * hang that on, and BlockNote embeds the result in static HTML. Callers that re-resolve often
 * should track and revoke `blob:` results themselves.
 */
export async function resolveBlockNoteFileRef(ref: string, ctx: RefContext = {}): Promise<string> {
  if (!ref.length) return '';

  // Attachment ids are UUIDs (no slashes); public cloud keys contain slashes.
  if (ref.includes('/')) return getPublicFileUrl(ref);

  // Private attachment: prefer a local blob, else resolve a presigned URL by id.
  const localResult = await attachmentStorage.createBlobUrlWithVariant(ref, 'converted', true);
  if (localResult) return localResult.url;

  const cached = findAttachmentInCache(ref);
  const tenantId = cached?.tenantId ?? ctx.tenantId;
  const organizationId = cached?.organizationId ?? ctx.organizationId;
  if (!tenantId || !organizationId) {
    console.error('[BlockNote] Cannot resolve private file URL: no tenantId/organizationId for id:', ref);
    return '';
  }

  return getPrivateFileUrlById(ref, 'converted', tenantId, organizationId);
}
