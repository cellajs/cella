import { count, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { productTables } from '#/db/product-tables';
import { tenantReadById } from '#/db/tenant-context';
import { mailer } from '#/lib/mailer';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { deleteArchivedTenant, findArchivedTenants } from '#/modules/tenants/tenants-queries';
import { getIsoDate, isoDateAgo } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { tenantRemovedEmail } from '../../../../emails';

/** What a tenant holds, one line per kind: its members and its live rows of every product type. */
async function countTenantRows(tenantId: string): Promise<string[]> {
  const [members] = await baseDb.select({ total: count() }).from(membershipsTable).where(eq(membershipsTable.tenantId, tenantId));
  const products = await tenantReadById(tenantId, async (db) => {
    const lines: string[] = [];
    for (const [entityType, getTable] of Object.entries(productTables)) {
      const table = getTable();
      const [{ total }] = await db.select({ total: count() }).from(table).where(eq(table.tenantId, tenantId));
      lines.push(`${entityType}: ${total}`);
    }
    return lines;
  });
  return [`members: ${members.total}`, ...products];
}

/**
 * Removes the tenants archived longer than `appConfig.retention.archivedTenantDays`: an organization its admin deleted,
 * or a tenant whose contract ended. Each goes with its organization and everything in it, the stored files through the
 * deletion queue, and the operator gets a mail per tenant with what was removed: the written confirmation a processing
 * agreement asks for. A tenant that fails is logged and tried again at the next run.
 * @returns The number of tenants removed.
 * @throws After every tenant ran, when any of them failed, so the jobs worker records a failed run.
 */
export async function removeArchivedTenants(): Promise<number> {
  const archivedBefore = isoDateAgo(new TimeSpan(appConfig.retention.archivedTenantDays, 'd'));
  const due = await findArchivedTenants({ var: { db: baseDb } }, { archivedBefore });

  let removed = 0;
  const failed: string[] = [];
  for (const tenant of due) {
    try {
      const counts = await countTenantRows(tenant.id);
      const deleted = await deleteArchivedTenant({ var: { db: baseDb } }, { tenantId: tenant.id, archivedBefore });
      // Restored or archived again since the listing: kept, and no mail.
      if (!deleted) continue;
      removed += 1;
      log.info('Archived tenant removed', { tenantId: tenant.id, counts });
      const statics = { tenantId: tenant.id, tenantName: tenant.name, archivedAt: tenant.statusChangedAt, removedAt: getIsoDate(), counts };
      await mailer
        .sendEmails(tenantRemovedEmail, statics, [{ email: appConfig.company.email, lng: appConfig.defaultLanguage }])
        .catch((err) => log.error('Failed to mail the removal of a tenant', { tenantId: tenant.id, err }));
    } catch (error) {
      failed.push(tenant.id);
      log.error('Removing an archived tenant failed', { tenantId: tenant.id, err: error });
    }
  }

  if (failed.length > 0) throw new Error(`Removing archived tenants failed for ${failed.length} tenant(s)`);
  return removed;
}
