import { appConfig } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { isPublicUploadTemplate } from 'shared/utils/upload-visibility';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/** An offline upload keeps its local blob URL, or nothing, until it syncs: neither names a stored object. */
const isLocalKey = (key: string) => key === '' || key.startsWith('blob:');

/** The app's own bucket for a file of this visibility. */
export const appBucketFor = (publicBucket: boolean) =>
  publicBucket ? appConfig.s3.publicBucket : appConfig.s3.privateBucket;

/**
 * Where attachment files are stored, as the attachment upload template decides. The server stamps it on every row and
 * ignores what a client claims, so a row never names storage its upload did not use.
 */
export const attachmentBucket = () => {
  const publicBucket = isPublicUploadTemplate('attachment');
  return { publicBucket, bucketName: appBucketFor(publicBucket) };
};

/**
 * Whether an attachment names only its own organization's storage: the app's bucket for its visibility, and every
 * variant key local or under the organization's prefix. Keys arrive from the client and the backend signs them, so a
 * row that fails this would hand out another tenant's object.
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
