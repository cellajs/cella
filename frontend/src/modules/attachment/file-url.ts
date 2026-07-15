import { getPresignedUrl } from 'sdk/sdk.gen';
import { appConfig } from 'shared';
import type { BlobVariant } from '~/modules/attachment/dexie/attachments-db';

/** Variants that exist as stored cloud keys (BlobVariant minus the local-only 'raw'). */
export type CloudFileVariant = Exclude<BlobVariant, 'raw'>;

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
