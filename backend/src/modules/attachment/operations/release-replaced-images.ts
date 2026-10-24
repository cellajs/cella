import { appConfig } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { tenantReadById } from '#/db/tenant-context';
import { deleteStoredObjects, objectStorageConfigured } from '#/lib/object-storage';
import { findLiveAttachmentKeys } from '#/modules/attachment/attachment-queries';
import { log } from '#/utils/logger';

const imageColumns = ['thumbnailUrl', 'bannerUrl'] as const;

type ImageValues = Partial<Record<(typeof imageColumns)[number], unknown>>;

interface ReleaseReplacedImagesOpts {
  /** Whose uploads the images are: a user's personal ones, or an organization's (an organization or one of its channels). */
  owner: { userId: string } | { organizationId: string; tenantId: string };
  /** The row's image URLs before the write. */
  before: ImageValues;
  /** The values the write set; a column left out was not written. */
  after: ImageValues;
}

/** The storage key of a URL on the public CDN, without the leading slash an upload path may keep; null for any other URL. */
const publicKeyOf = (url: string): string | null => {
  const base = `${appConfig.s3.publicCDNUrl}/`;
  return url.startsWith(base) ? url.slice(base.length).replace(/^\/+/, '') : null;
};

/**
 * Deletes the stored images a committed write replaced or cleared: each `thumbnailUrl` or `bannerUrl` the row held and
 * the write changed, when it names an object in the public bucket under the owner's own prefix and no live attachment
 * of the organization names its key. An image shared with an attachment or another column of the row stays. A failure
 * is logged, never thrown: the write already holds.
 */
export async function releaseReplacedImages({ owner, before, after }: ReleaseReplacedImagesOpts): Promise<void> {
  if (!objectStorageConfigured()) return;
  const stillNamed = new Set(imageColumns.map((column) => (after[column] === undefined ? before[column] : after[column])));
  const ownerPrefix = 'userId' in owner ? owner.userId : owner.organizationId;
  const keys = imageColumns.flatMap((column) => {
    const url = before[column];
    if (after[column] === undefined || typeof url !== 'string' || stillNamed.has(url)) return [];
    const key = publicKeyOf(url);
    // `isOrganizationKey` is the prefix rule of every upload path, a user's personal prefix included.
    return key && isOrganizationKey(key, ownerPrefix) ? [key] : [];
  });
  if (keys.length === 0) return;

  try {
    const named = 'tenantId' in owner ? await tenantReadById(owner.tenantId, (db) => findLiveAttachmentKeys({ var: { db } }, { keys })) : new Set();
    const released = keys.filter((key) => !named.has(key));
    if (released.length > 0) await deleteStoredObjects(appConfig.s3.publicBucket, released);
  } catch (error) {
    log.error('Replaced images could not be deleted', { keys, err: error });
  }
}
