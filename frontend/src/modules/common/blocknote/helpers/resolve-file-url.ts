import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { getFileUrl } from '~/modules/attachment/file-url';
import { findAttachmentInCache } from '~/modules/attachment/query';
import type { CommonBlockNoteProps } from '~/modules/common/blocknote/types';

interface ResolveFileUrlContext {
  /** When set, files are treated as public regardless of `baseFilePanelProps.isPublic`. */
  publicFiles: boolean | undefined;
  baseFilePanelProps: CommonBlockNoteProps['baseFilePanelProps'];
}

/**
 * Build the `resolveFileUrl` callback for BlockNote with offline-first lookup.
 *
 * Resolution strategy:
 * 1. If the key looks like an attachment ID (nanoid format, no slashes), try
 *    local blob storage first with variant fallback (converted → original → raw).
 * 2. Otherwise (or if no local blob), fall back to a presigned cloud URL.
 *    - Public files use the CDN URL directly (no tenant context required).
 *    - Private files require `tenantId` + `organizationId`, sourced from the
 *      attachment cache (if available) or `baseFilePanelProps`.
 */
export function createResolveFileUrl({ publicFiles, baseFilePanelProps }: ResolveFileUrlContext) {
  return async (key: string): Promise<string> => {
    if (!key.length) return '';

    // Attachment IDs are nanoid format; cloud keys contain slashes.
    const isAttachmentId = !key.includes('/');

    if (isAttachmentId) {
      const localResult = await attachmentStorage.createBlobUrlWithVariant(key, 'converted', true);
      if (localResult) return localResult.url;
    }

    const isPublic = publicFiles ?? baseFilePanelProps?.isPublic ?? false;

    // Public files use CDN URL directly — no tenantId/organizationId needed.
    if (isPublic) return getFileUrl(key, true, '', '');

    const cachedAttachment = isAttachmentId ? findAttachmentInCache(key) : null;
    const tenantId = cachedAttachment?.tenantId ?? baseFilePanelProps?.tenantId;
    const organizationId = cachedAttachment?.organizationId ?? baseFilePanelProps?.organizationId;

    if (!tenantId || !organizationId) {
      console.error('[BlockNote] Cannot resolve private file URL: no tenantId/organizationId available for key:', key);
      return '';
    }

    return getFileUrl(key, false, tenantId, organizationId);
  };
}
