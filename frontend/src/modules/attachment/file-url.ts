import { getPresignedUrl } from 'sdk/sdk.gen';
import { appConfig } from 'shared';

/**
 * Constructs a public CDN URL for a file key.
 * Use for public files to avoid the presigned URL endpoint.
 */
function getPublicFileUrl(key: string): string {
  return `${appConfig.s3.publicCDNUrl}/${key}`;
}

/**
 * Gets the URL for a file based on its public/private status.
 * Public files use direct CDN URL, private files use presigned URL endpoint.
 */
export async function getFileUrl(
  key: string,
  isPublic: boolean,
  tenantId: string,
  organizationId: string,
): Promise<string> {
  if (isPublic) return getPublicFileUrl(key);
  return getPresignedUrl({ path: { tenantId, organizationId }, query: { key } });
}
