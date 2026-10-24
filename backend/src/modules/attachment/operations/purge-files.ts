import { and, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { tenantContextIncludingDeletedById } from '#/db/tenant-context';
import { stripChangedFields } from '#/db/utils/strip-changed-fields';
import { deleteStoredObjects, deleteStoredPrefix, objectStorageConfigured } from '#/lib/object-storage';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { findLiveAttachmentKeys } from '#/modules/attachment/attachment-queries';
import { isSignableKey } from '#/modules/attachment/helpers/storage-key';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** A deleted attachment keeps its files this long, for offline devices that still replay edits on it. */
const purgeGraceMs = 24 * 60 * 60 * 1000;

/** Deleted rows one run purges per tenant; the next run takes the rest. */
const purgeBatchSize = 500;

type PurgeCandidate = Pick<typeof attachmentsTable.$inferSelect, 'id' | 'organizationId' | 'bucketName' | 'keys'>;

/** Purges one tenant's batch: reads candidates, deletes their files outside the transaction, then stamps the rows. */
async function purgeTenantFiles(tenantId: string, deletedBefore: string): Promise<number> {
  const { candidates, stillUsed } = await tenantContextIncludingDeletedById(tenantId, async (tx) => {
    const candidates: PurgeCandidate[] = await tx
      .select({
        id: attachmentsTable.id,
        organizationId: attachmentsTable.organizationId,
        bucketName: attachmentsTable.bucketName,
        keys: attachmentsTable.keys,
      })
      .from(attachmentsTable)
      .where(and(isNotNull(attachmentsTable.deletedAt), lt(attachmentsTable.deletedAt, deletedBefore), isNull(attachmentsTable.purgedAt)))
      .limit(purgeBatchSize);
    const keys = candidates.flatMap((row) => Object.values(row.keys).filter((key): key is string => !!key));
    return { candidates, stillUsed: await findLiveAttachmentKeys({ var: { db: tx } }, { keys }) };
  });
  if (candidates.length === 0) return 0;

  // Only an object the app stored for the row's organization goes: a local key names none, a seeded object is shared.
  const byBucket = new Map<string, Set<string>>();
  for (const { organizationId, bucketName, keys } of candidates) {
    for (const key of Object.values(keys)) {
      if (!key || stillUsed.has(key) || !isSignableKey(key, bucketName, organizationId)) continue;
      byBucket.set(bucketName, (byBucket.get(bucketName) ?? new Set()).add(key));
    }
  }
  for (const [bucketName, keys] of byBucket) await deleteStoredObjects(bucketName, [...keys]);

  const ids = candidates.map((row) => row.id);
  await tenantContextIncludingDeletedById(tenantId, (tx) =>
    tx
      .update(attachmentsTable)
      .set({ purgedAt: getIsoDate(), stx: stripChangedFields(attachmentsTable.stx) })
      .where(inArray(attachmentsTable.id, ids)),
  );
  return candidates.length;
}

/**
 * Deletes the stored files of attachments deleted more than a day ago, whatever deleted them (a user, an API client, the
 * CDC worker's owned-embedding cleanup), and stamps `purgedAt` on their rows. A key a live row still names stays. Runs
 * tenant by tenant under RLS; a tenant that fails is logged and retried at the next run.
 * @returns The number of rows purged.
 * @throws After every tenant ran, when any of them failed, so the jobs worker records a failed run.
 */
export async function purgeDeletedAttachmentFiles(now = Date.now()): Promise<number> {
  if (!objectStorageConfigured()) return 0;

  const deletedBefore = new Date(now - purgeGraceMs).toISOString();
  const tenants = await baseDb.select({ id: tenantsTable.id }).from(tenantsTable);

  let purged = 0;
  const failed: string[] = [];
  for (const { id: tenantId } of tenants) {
    try {
      purged += await purgeTenantFiles(tenantId, deletedBefore);
    } catch (error) {
      failed.push(tenantId);
      log.error('Attachment file purge failed for a tenant', { tenantId, err: error });
    }
  }

  if (purged > 0) log.info('Attachment files purged', { rows: purged });
  if (failed.length > 0) throw new Error(`Attachment file purge failed for ${failed.length} tenant(s)`);
  return purged;
}

/**
 * Deletes everything stored under each organization's prefix in both upload buckets: its attachments, avatar and
 * banner. For a deleted organization, whose rows are gone. A failure is logged with the prefix; nothing retries it.
 */
export async function purgeOrganizationFiles(organizationIds: string[]): Promise<void> {
  if (!objectStorageConfigured()) return;
  const buckets = [appConfig.s3.privateBucket, appConfig.s3.publicBucket];
  for (const organizationId of organizationIds) {
    // A stored key may keep the leading slash of the signed upload path, which `isOrganizationKey` tolerates too.
    for (const prefix of [`${organizationId}/`, `/${organizationId}/`]) {
      for (const bucketName of buckets) {
        try {
          const deleted = await deleteStoredPrefix(bucketName, prefix);
          if (deleted > 0) log.info('Organization files purged', { organizationId, bucketName, objects: deleted });
        } catch (error) {
          log.error('Organization file purge failed', { organizationId, bucketName, prefix, err: error });
        }
      }
    }
  }
}
