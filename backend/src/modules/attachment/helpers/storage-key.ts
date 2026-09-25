import { appConfig } from 'shared';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/** An offline upload keeps its local blob URL, or nothing, until it syncs: neither names a stored object. */
const isLocalKey = (key: string) => key === '' || key.startsWith('blob:');

/** `.` and `..` segments, also percent-encoded: a URL resolving the key would climb out of the prefix. */
const isDotSegment = (segment: string) => ['.', '..'].includes(segment.toLowerCase().replaceAll('%2e', '.'));

/**
 * Whether `key` lies under the organization's upload prefix. The upload token signs `<organizationId>/<userId>` as the
 * storage path, so every object the app stores for an organization starts there; a leading slash is tolerated.
 */
export function isOrganizationKey(key: string, organizationId: string): boolean {
  const path = key.startsWith('/') ? key.slice(1) : key;
  if (!path.startsWith(`${organizationId}/`) || path.includes('\\')) return false;
  return !path.split('/').some(isDotSegment);
}

/** The app's own bucket for a file of this visibility. */
export const appBucketFor = (publicBucket: boolean) =>
  publicBucket ? appConfig.s3.publicBucket : appConfig.s3.privateBucket;

/**
 * Whether an attachment names only its own organization's storage: the app's bucket for its visibility, and every
 * variant key local or under the organization's prefix. Key and bucket arrive from the client and the backend signs
 * them, so a row that fails this would hand out another tenant's object.
 */
export function namesOwnStorage(
  attachment: { keys: AttachmentKeys; bucketName: string; publicBucket?: boolean | null },
  organizationId: string,
): boolean {
  if (attachment.bucketName !== appBucketFor(attachment.publicBucket === true)) return false;
  return Object.values(attachment.keys).every(
    (key) => key === undefined || isLocalKey(key) || isOrganizationKey(key, organizationId),
  );
}

/** Whether the presign boundary may sign `key` in `bucketName` for a row of `organizationId`. */
export function isSignableKey(key: string, bucketName: string, organizationId: string): boolean {
  const appBuckets = [appConfig.s3.privateBucket, appConfig.s3.publicBucket];
  return appBuckets.includes(bucketName) && (key.startsWith('blob:') || isOrganizationKey(key, organizationId));
}
