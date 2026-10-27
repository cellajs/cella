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
  /** Whose uploads the images are: a user's personal ones, or an organization's (an organization or one of its channels). */
  owner: { userId: string } | { organizationId: string; tenantId: string };
  /** The row's image URLs before the write. */
  before: ImageValues;
  /** The values the write set; a column left out was not written. */
  after: ImageValues;
}

/**
 * Deletes the stored images a committed write replaced or cleared: each `thumbnailUrl` or `bannerUrl` the row held and
 * the write changed, when it names an object in the public bucket under the owner's own prefix that none of the owner's
 * rows still names (the user's row, or the organization's and its channels' rows) and no live attachment of the
 * organization keeps. An image another column of this row or another of the owner's rows names stays; a row of anyone
 * else naming it keeps nothing. A failure is logged, never thrown: the write already holds.
 */
export async function releaseReplacedImages({ owner, before, after }: ReleaseReplacedImagesOpts): Promise<void> {
  if (!isObjectStorageConfigured()) return;
  const stillNamed = new Set(imageFields.map((field) => (after[field] === undefined ? before[field] : after[field])));
  const ownerPrefix = 'userId' in owner ? owner.userId : owner.organizationId;
  const keys = imageFields.flatMap((field) => {
    const url = before[field];
    if (after[field] === undefined || typeof url !== 'string' || stillNamed.has(url)) return [];
    const key = publicKeyOf(url);
    // `isOrganizationKey` is the prefix rule of every upload path, a user's personal prefix included.
    return key && isOrganizationKey(key, ownerPrefix) ? [key] : [];
  });
  if (keys.length === 0) return;

  try {
    const [images, attachments] = await Promise.all([
      findNamedImageKeys(
        { var: { db: baseDb } },
        { keys, holder: 'userId' in owner ? { userId: owner.userId } : { organizationId: owner.organizationId } },
      ),
      'tenantId' in owner ? tenantReadById(owner.tenantId, (db) => findLiveAttachmentKeys({ var: { db } }, { keys })) : new Set<string>(),
    ]);
    const released = keys.filter((key) => !images.has(key) && !attachments.has(key));
    if (released.length > 0) await deleteStoredObjects(appConfig.s3.publicBucket, released);
  } catch (error) {
    log.error('Replaced images could not be deleted', { keys, err: error });
  }
}
