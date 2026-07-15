import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { getPrivateFileUrlById, getPublicFileUrl } from '~/modules/attachment/file-url';
import { findAttachmentInCache } from '~/modules/attachment/query';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';

interface ResolveFileUrlContext {
  /** When set, files are treated as public regardless of `baseFilePanelProps.isPublic`. */
  publicFiles?: boolean;
  baseFilePanelProps: CommonBlockNoteProps['baseFilePanelProps'];
}

/**
 * Build the `resolveFileUrl` callback for BlockNote.
 *
 * The block reference alone determines resolution — no public/private flag needed:
 * - A **UUID attachment id** (no slashes) → private media. Try a local blob first
 *   (offline-first), else a presigned URL by id + variant (permission-checked server-side).
 * - A **slashed cloud key** → public media, served directly from the CDN.
 */
export function createResolveFileUrl({ baseFilePanelProps }: ResolveFileUrlContext) {
  return async (ref: string): Promise<string> => {
    if (!ref.length) return '';

    // Attachment ids are UUIDs (no slashes); public cloud keys contain slashes.
    const isAttachmentId = !ref.includes('/');
    if (!isAttachmentId) return getPublicFileUrl(ref);

    // Private attachment: prefer a local blob, else resolve a presigned URL by id.
    const localResult = await attachmentStorage.createBlobUrlWithVariant(ref, 'converted', true);
    if (localResult) return localResult.url;

    const cachedAttachment = findAttachmentInCache(ref);
    const tenantId = cachedAttachment?.tenantId ?? baseFilePanelProps?.tenantId;
    const organizationId = cachedAttachment?.organizationId ?? baseFilePanelProps?.organizationId;
    if (!tenantId || !organizationId) {
      console.error('[BlockNote] Cannot resolve private file URL: no tenantId/organizationId for id:', ref);
      return '';
    }

    return getPrivateFileUrlById(ref, 'converted', tenantId, organizationId);
  };
}
