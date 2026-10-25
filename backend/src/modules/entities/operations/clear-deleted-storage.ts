import { asc, inArray } from 'drizzle-orm';
import { appConfig, isProduct, type ProductEntityType } from 'shared';
import { isOrganizationKey } from 'shared/utils/media-ref';
import { isLocalStorageKey } from 'shared/utils/storage-key';
import { baseDb } from '#/db/db';
import { imageColumns } from '#/db/storage-columns';
import { tenantContextById } from '#/db/tenant-context';
import { deleteStoredObjects, deleteStoredPrefix, objectStorageConfigured } from '#/lib/object-storage';
import { findLiveAttachmentKeys } from '#/modules/attachment/attachment-queries';
import { isSignableKey, publicKeyOf } from '#/modules/attachment/helpers/storage-key';
import { type DeletedStorageModel, deletedStorageTable } from '#/modules/entities/deleted-storage-db';
import { retireYjsDocuments } from '#/modules/yjs/operations/retire-yjs-documents';
import { getYjsMaterializer } from '#/modules/yjs/yjs-materializers';
import { log } from '#/utils/logger';

/** Queue rows one run takes; the next run takes the rest. */
const batchSize = 500;

interface StoredObject {
  bucketName: string;
  key: string;
}

/**
 * The stored objects a deleted row named that lie under its owner's own prefix: an attachment's variant keys under its
 * organization's, an image under its organization's or, for a user, the user's own. A seeded or shared object stays.
 */
function ownedObjectsOf({ entityType, entityId, organizationId, storage }: DeletedStorageModel): StoredObject[] {
  const objects: StoredObject[] = [];
  const { bucket_name: bucketName, keys } = storage;
  if (typeof bucketName === 'string' && organizationId && keys && typeof keys === 'object') {
    for (const key of Object.values(keys)) {
      if (typeof key === 'string' && !isLocalStorageKey(key) && isSignableKey(key, bucketName, organizationId)) objects.push({ bucketName, key });
    }
  }
  const owner = entityType === 'user' ? entityId : organizationId;
  for (const column of imageColumns) {
    const url = storage[column];
    const key = typeof url === 'string' ? publicKeyOf(url) : null;
    // `isOrganizationKey` is the prefix rule of every upload path, a user's personal prefix included.
    if (key && owner && isOrganizationKey(key, owner)) objects.push({ bucketName: appConfig.s3.publicBucket, key });
  }
  return objects;
}

/**
 * Clears one tenant's share of the queue: retires the collaborative documents of its product rows, then deletes the
 * files no live attachment of the tenant names and, for a deleted organization, everything under its prefix in both
 * buckets. A user's rows come with no tenant and hold images only.
 */
async function clearTenant(tenantId: string | null, rows: DeletedStorageModel[]): Promise<void> {
  const objects = rows.flatMap(ownedObjectsOf);
  let released = objects;

  if (tenantId) {
    const documents = new Map<ProductEntityType, string[]>();
    for (const row of rows) {
      if (isProduct(row.entityType) && getYjsMaterializer(row.entityType))
        documents.set(row.entityType, [...(documents.get(row.entityType) ?? []), row.entityId]);
    }
    released = await tenantContextById(tenantId, async (db) => {
      for (const [entityType, entityIds] of documents) await retireYjsDocuments({ var: { db } }, { entityType, entityIds });
      const named = await findLiveAttachmentKeys({ var: { db } }, { keys: objects.map(({ key }) => key) });
      return objects.filter(({ key }) => !named.has(key));
    });
  }

  if (!objectStorageConfigured()) return;
  for (const bucketName of new Set(released.map((object) => object.bucketName))) {
    await deleteStoredObjects(
      bucketName,
      released.filter((object) => object.bucketName === bucketName).map(({ key }) => key),
    );
  }
  for (const { entityType, entityId } of rows) {
    if (entityType !== 'organization') continue;
    // A stored key may keep the leading slash of the signed upload path, which `isOrganizationKey` tolerates too.
    for (const prefix of [`${entityId}/`, `/${entityId}/`]) {
      for (const bucketName of [appConfig.s3.privateBucket, appConfig.s3.publicBucket]) await deleteStoredPrefix(bucketName, prefix);
    }
  }
}

/**
 * Clears what deleted entity rows left outside their tables, from the queue their delete triggers fill: whatever
 * deleted them, a request, an FK cascade from a channel or organization, or `apply_retention()`. Works the oldest batch
 * tenant by tenant and deletes the queue rows a tenant cleared; a tenant that fails keeps its rows for the next run.
 * @returns The number of queue rows cleared.
 * @throws After every tenant ran, when any of them failed, so the jobs worker records a failed run.
 */
export async function clearDeletedStorage(): Promise<number> {
  const rows = await baseDb.select().from(deletedStorageTable).orderBy(asc(deletedStorageTable.id)).limit(batchSize);
  const byTenant = new Map<string | null, DeletedStorageModel[]>();
  for (const row of rows) byTenant.set(row.tenantId, [...(byTenant.get(row.tenantId) ?? []), row]);

  let cleared = 0;
  const failed: (string | null)[] = [];
  for (const [tenantId, tenantRows] of byTenant) {
    try {
      await clearTenant(tenantId, tenantRows);
      await baseDb.delete(deletedStorageTable).where(
        inArray(
          deletedStorageTable.id,
          tenantRows.map(({ id }) => id),
        ),
      );
      cleared += tenantRows.length;
    } catch (error) {
      failed.push(tenantId);
      log.error('Clearing deleted storage failed for a tenant', { tenantId, err: error });
    }
  }

  if (cleared > 0) log.info('Deleted storage cleared', { rows: cleared });
  if (failed.length > 0) throw new Error(`Clearing deleted storage failed for ${failed.length} tenant(s)`);
  return cleared;
}
