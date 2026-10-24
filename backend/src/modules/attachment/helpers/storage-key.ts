import { appConfig } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { isLocalStorageKey } from 'shared/utils/storage-key';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/** A key under the uploader's own prefix, `<organizationId>/<userId>`: the storage path the upload token signs. */
const isUploaderKey = (key: string, organizationId: string, userId: string) => isOrganizationKey(key, `${organizationId}/${userId}`);

/**
 * Whether every variant key of a new attachment is local or under its uploader's own prefix. Keys arrive from the
 * client and the backend signs them, so a row that fails this would hand out another member's or tenant's object.
 */
export function namesOwnStorage(keys: AttachmentKeys, organizationId: string, userId: string): boolean {
  return Object.values(keys).every((key) => key === undefined || isLocalStorageKey(key) || isUploaderKey(key, organizationId, userId));
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

/** Whether every variant key names a stored object under the uploader's own prefix; no local key, for keys linked to an existing row. */
export function namesUploaderStorage(keys: AttachmentKeys, organizationId: string, userId: string): boolean {
  return Object.values(keys).every((key) => key === undefined || isUploaderKey(key, organizationId, userId));
}
