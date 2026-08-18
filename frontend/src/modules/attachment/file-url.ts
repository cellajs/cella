import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import type { BlobVariant } from '~/modules/attachment/offline/attachments-db';
import { getPresignedUrlBatched } from '~/modules/attachment/presign-batch';

/** Variants that exist as stored cloud keys (BlobVariant minus the local-only 'raw'). */
export type CloudFileVariant = Exclude<BlobVariant, 'raw'>;

/** Cloud-key fields an attachment carries, enough to resolve any variant's URL. */
type CloudKeyFields = Pick<Attachment, 'keys' | 'publicBucket'>;

/** The cloud key for a variant, or null when it has none; 'raw' is the local-only pre-processing file. */
export function getVariantKey(attachment: CloudKeyFields, variant: BlobVariant): string | null {
  if (variant === 'raw') return null;
  return attachment.keys[variant] || null;
}

/** Public CDN URL for a file key, which skips the presigned URL endpoint. */
export function getPublicFileUrl(key: string): string {
  return `${appConfig.s3.publicCDNUrl}/${key}`;
}

/** Presigned URL by id + variant: the server signs the key, and concurrent calls coalesce into one memoized batch request. */
export async function getPrivateFileUrlById(
  attachmentId: string,
  variant: CloudFileVariant,
  tenantId: string,
  organizationId: string,
): Promise<string> {
  return getPresignedUrlBatched(attachmentId, variant, tenantId, organizationId);
}

/** Cloud URL for a variant: public keys become CDN URLs, private ones are signed server-side by id. Null when the variant has no cloud key. */
export async function getCloudUrl(
  attachment: CloudKeyFields & Pick<Attachment, 'id' | 'tenantId' | 'organizationId'>,
  variant: CloudFileVariant,
): Promise<string | null> {
  const key = getVariantKey(attachment, variant);
  if (!key) return null;

  if (attachment.publicBucket) return getPublicFileUrl(key);
  return getPrivateFileUrlById(attachment.id, variant, attachment.tenantId, attachment.organizationId);
}
