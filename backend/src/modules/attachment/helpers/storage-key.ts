import { appConfig } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { isLocalStorageKey } from 'shared/utils/storage-key';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/** The storage key of a URL on the public CDN, without the leading slash an upload path may keep; null for any other URL. */
export function publicKeyOf(url: string): string | null {
  const base = `${appConfig.s3.publicCDNUrl}/`;
  return url.startsWith(base) ? url.slice(base.length).replace(/^\/+/, '') : null;
}

/**
 * Whether every variant key lies under the uploader's own prefix, `<organizationId>/<userId>`: the storage path the
 * upload token signs. Keys arrive from the client and the backend signs them, so a row that fails this would hand out
 * another member's or tenant's object. `allowLocal` also admits an offline upload's local keys, for a new attachment.
 */
export function namesUploaderStorage(keys: AttachmentKeys, organizationId: string, userId: string, { allowLocal = false } = {}): boolean {
  const prefix = `${organizationId}/${userId}`;
  return Object.values(keys).every((key) => key === undefined || (allowLocal && isLocalStorageKey(key)) || isOrganizationKey(key, prefix));
}

/**
 * Whether the presign boundary may sign `key` in `bucketName` for a row of `organizationId`: only a key under the
 * organization's prefix in an app bucket. A `blob:` key names no stored object and is never signed. The file purge
 * deletes only such keys, so a shared seed object is never removed with a row.
 */
export function isSignableKey(key: string, bucketName: string, organizationId: string): boolean {
  const appBuckets = [appConfig.s3.privateBucket, appConfig.s3.publicBucket];
  return appBuckets.includes(bucketName) && isOrganizationKey(key, organizationId);
}
