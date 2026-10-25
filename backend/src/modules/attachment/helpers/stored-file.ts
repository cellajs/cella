import { hasCloudFile, isLocalStorageKey } from 'shared/utils/storage-key';
import { AppError } from '#/core/error';
import { objectStorageConfigured, storedObjectSize } from '#/lib/object-storage';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/**
 * Checks that every variant key names an object `bucketName` stores, and reads the original's size from the bucket:
 * the client reports keys and size, the bucket proves them.
 * @returns The original's size in bytes; null for an offline upload's local keys, or when the backend holds no S3 keys.
 * @throws AppError 400 when a variant key names no stored object.
 */
export async function storedFileSize(keys: AttachmentKeys, bucketName: string): Promise<number | null> {
  if (!hasCloudFile(keys) || !objectStorageConfigured()) return null;

  const variants = Object.entries(keys).flatMap(([variant, key]) => (key && !isLocalStorageKey(key) ? [{ variant, key }] : []));
  const sizes = await Promise.all(variants.map(({ key }) => storedObjectSize(bucketName, key)));

  const missing = variants.filter((_, index) => sizes[index] === null).map(({ variant }) => variant);
  if (missing.length > 0) {
    throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment', meta: { reason: 'missing_object', variants: missing } });
  }

  return sizes[variants.findIndex(({ variant }) => variant === 'original')] ?? null;
}
