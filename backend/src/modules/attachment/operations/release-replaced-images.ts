import { appConfig } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { baseDb } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import { deleteStoredObjects, isObjectStorageConfigured } from '#/lib/object-storage';
import { findLiveAttachmentKeys, findNamedImageKeys } from '#/modules/attachment/attachment-queries';
import { publicKeyOf } from '#/modules/attachment/helpers/storage-key';
import { log } from '#/utils/logger';

/** The image fields of a user or channel row: the columns `imageColumns` (db/storage-columns.ts) names, as rows name them. */
const imageFields = ['thumbnailUrl', 'bannerUrl'] as const;

type ImageValues = Partial<Record<(typeof imageFields)[number], unknown>>;

interface ReleaseReplacedImagesOpts {
  /** Whose uploads the images are and whose rows keep them: a user (their row), or an organization (its row and its channels' rows). */
  holder: { userId: string } | { organizationId: string; tenantId: string };
  /** The row's image URLs before the write. */
  before: ImageValues;
  /** The values the write set; a column left out was not written. */
  after: ImageValues;
}

/**
 * Deletes the stored images a committed write replaced or cleared: each `thumbnailUrl` or `bannerUrl` the row held and
 * the write changed, when it names an object in the public bucket under the holder's prefix that none of the holder's
 * rows still names (the user's row, or the organization's and its channels' rows) and no live attachment of the
 * organization keeps. An image another column of this row or another of the holder's rows names stays; a row of anyone
 * else naming it keeps nothing. A failure is logged, never thrown: the write already holds.
 */
export async function releaseReplacedImages({ holder, before, after }: ReleaseReplacedImagesOpts): Promise<void> {
  if (!isObjectStorageConfigured()) return;
  const stillNamed = new Set(imageFields.map((field) => (after[field] === undefined ? before[field] : after[field])));
  // A user's personal uploads lie under their id as an organization's lie under its id: one prefix rule for both.
  const holderPrefix = 'userId' in holder ? holder.userId : holder.organizationId;
  const keys = imageFields.flatMap((field) => {
    const url = before[field];
    if (after[field] === undefined || typeof url !== 'string' || stillNamed.has(url)) return [];
    const key = publicKeyOf(url);
    return key && isOrganizationKey(key, holderPrefix) ? [key] : [];
  });
  if (keys.length === 0) return;

  try {
    const [images, attachments] = await Promise.all([
      findNamedImageKeys({ var: { db: baseDb } }, { keys, holder }),
      'tenantId' in holder
        ? tenantReadById(holder.tenantId, (db) => findLiveAttachmentKeys({ var: { db } }, { tenantId: holder.tenantId, keys }))
        : new Set<string>(),
    ]);
    const released = keys.filter((key) => !images.has(key) && !attachments.has(key));
    if (released.length > 0) await deleteStoredObjects(appConfig.s3.publicBucket, released);
  } catch (error) {
    log.error('Replaced images could not be deleted', { keys, err: error });
  }
}
