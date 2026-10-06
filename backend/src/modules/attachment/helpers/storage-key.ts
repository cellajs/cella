import { appConfig } from 'shared';
import { isUuid } from 'shared/utils/entity-id';
import { isOrganizationKey } from 'shared/utils/media-ref';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/**
 * A local blob URL as a browser mints it for a file not yet uploaded: `blob:`, an http(s) origin and a UUID path, in
 * canonical form, so no dot segment, userinfo or query rides along. It names no stored object.
 */
const isLocalBlobUrl = (key: string): boolean => {
  if (!key.startsWith('blob:')) return false;
  try {
    const url = new URL(key.slice('blob:'.length));
    return (url.protocol === 'http:' || url.protocol === 'https:') && isUuid(url.pathname.slice(1)) && key === `blob:${url.origin}${url.pathname}`;
  } catch {
    return false;
  }
};

/** An offline upload keeps its local blob URL, or nothing, until it syncs: neither names a stored object. */
const isLocalKey = (key: string) => key === '' || isLocalBlobUrl(key);

/**
 * Whether every variant key of an attachment names its own organization's storage: local, or under the organization's
 * prefix. Keys arrive from the client and the backend signs them, so a row that fails this would hand out another
 * tenant's object.
 */
export function namesOwnStorage(keys: AttachmentKeys, organizationId: string): boolean {
  return Object.values(keys).every((key) => key === undefined || isLocalKey(key) || isOrganizationKey(key, organizationId));
}

/**
 * Whether the presign boundary may sign `key` in `bucketName` for a row of `organizationId`: only a key under the
 * organization's prefix in an app bucket. A `blob:` key names no stored object and is never signed.
 */
export function isSignableKey(key: string, bucketName: string, organizationId: string): boolean {
  const appBuckets = [appConfig.s3.privateBucket, appConfig.s3.publicBucket];
  return appBuckets.includes(bucketName) && isOrganizationKey(key, organizationId);
}
