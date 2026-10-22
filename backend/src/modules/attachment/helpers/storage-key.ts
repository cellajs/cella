import { appConfig } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { isLocalStorageKey } from 'shared/utils/storage-key';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/**
 * Whether every variant key of an attachment names its own organization's storage: local, or under the organization's
 * prefix. Keys arrive from the client and the backend signs them, so a row that fails this would hand out another
 * tenant's object.
 */
export function namesOwnStorage(keys: AttachmentKeys, organizationId: string): boolean {
  return Object.values(keys).every((key) => key === undefined || isLocalStorageKey(key) || isOrganizationKey(key, organizationId));
}

/**
 * Whether the presign boundary may sign `key` in `bucketName` for a row of `organizationId`: only a key under the
 * organization's prefix in an app bucket. A `blob:` key names no stored object and is never signed.
 */
export function isSignableKey(key: string, bucketName: string, organizationId: string): boolean {
  const appBuckets = [appConfig.s3.privateBucket, appConfig.s3.publicBucket];
  return appBuckets.includes(bucketName) && isOrganizationKey(key, organizationId);
}

/**
 * Whether every variant key names a stored object under the uploader's own prefix, `<organizationId>/<userId>`: the
 * storage path the upload token signs. Stricter than `namesOwnStorage`, for keys linked to an existing row.
 */
export function namesUploaderStorage(keys: AttachmentKeys, organizationId: string, userId: string): boolean {
  return Object.values(keys).every((key) => key === undefined || isOrganizationKey(key, `${organizationId}/${userId}`));
}
