import type { Attachment } from 'sdk';
import { getPresignedUrl } from 'sdk/sdk.gen';
import { appConfig } from 'shared';
import type { BlobVariant } from '~/modules/attachment/offline/attachments-db';

/** Variants that exist as stored cloud keys (BlobVariant minus the local-only 'raw'). */
export type CloudFileVariant = Exclude<BlobVariant, 'raw'>;

/** Cloud-key fields an attachment carries, enough to resolve any variant's URL. */
type CloudKeyFields = Pick<Attachment, 'originalKey' | 'convertedKey' | 'thumbnailKey' | 'public'>;

/**
 * The cloud key holding a given variant, or null when the variant has no cloud object.
 * 'raw' is local-only (the pre-processing user file) and never has one.
 */
export function getVariantKey(attachment: CloudKeyFields, variant: BlobVariant): string | null {
  switch (variant) {
    case 'thumbnail':
      return attachment.thumbnailKey || null;
    case 'converted':
      return attachment.convertedKey || null;
    case 'original':
      return attachment.originalKey || null;
    default:
      return null;
  }
}

/**
 * Constructs a public CDN URL for a file key.
 * Use for public files to avoid the presigned URL endpoint.
 */
export function getPublicFileUrl(key: string): string {
  return `${appConfig.s3.publicCDNUrl}/${key}`;
}

/**
 * Presigned URL for a private attachment referenced by id + variant.
 * The server resolves the row (RLS + permission) and signs the variant's key —
 * the client never submits a storage key. Preferred for entity grids/downloads.
 */
export async function getPrivateFileUrlById(
  attachmentId: string,
  variant: CloudFileVariant,
  tenantId: string,
  organizationId: string,
): Promise<string> {
  return getPresignedUrl({ path: { tenantId, organizationId }, query: { attachmentId, variant } });
}

/**
 * Cloud URL for a variant: public files build a CDN URL from the key, private files are signed
 * server-side by id. Returns null when the variant has no cloud key.
 *
 * This is the single place the public-vs-private branch lives; callers should not re-derive it.
 */
export async function getCloudUrl(
  attachment: CloudKeyFields & Pick<Attachment, 'id' | 'tenantId' | 'organizationId'>,
  variant: CloudFileVariant,
): Promise<string | null> {
  const key = getVariantKey(attachment, variant);
  if (!key) return null;

  if (attachment.public) return getPublicFileUrl(key);
  return getPrivateFileUrlById(attachment.id, variant, attachment.tenantId, attachment.organizationId);
}
