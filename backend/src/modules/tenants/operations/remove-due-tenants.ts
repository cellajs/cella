import { count, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { productTables } from '#/db/product-tables';
import { tenantReadById } from '#/db/tenant-context';
import { mailer } from '#/lib/mailer';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { findMemberUserIdsByTenant } from '#/modules/memberships/memberships-queries';
import { deleteDueTenant, findDueTenants } from '#/modules/tenants/tenants-queries';
import { deleteAccounts } from '#/modules/user/operations/delete-accounts';
import { findOrphanedAnonymousUserIds } from '#/modules/user/user-queries';
import { getIsoDate, isoDateAgo } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { tenantRemovedEmail } from '../../../../emails';

const dbCtx = { var: { db: baseDb } };

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
 * Removes the tenants whose time is over: archived longer than `appConfig.retention.archivedTenantDays` (an
 * organization its admin deleted, or a contract ended) or past their `expiresAt` (a demo after its days). Each goes
 * with its organization and everything in it, the stored files through the deletion queue, then the anonymous
 * accounts it orphaned: a member with no proven address and no membership left, such as a demo's account, which goes
 * with its actor row. An app's fixture account without an email row follows the same rule and goes with the last tenant
 * that held it; a fixture that must outlive its tenants needs a proven address or a membership elsewhere. For a kind
 * with operator notices the operator gets a mail per tenant with what was removed: the
 * written confirmation a processing agreement asks for. A tenant that fails is logged and tried again at the next run.
 * @returns The number of tenants removed.
 * @throws After every tenant ran, when any of them failed, so the jobs worker records a failed run.
 */
export async function removeDueTenants(): Promise<number> {
  const due = { archivedBefore: isoDateAgo(new TimeSpan(appConfig.retention.archivedTenantDays, 'd')), now: getIsoDate() };
  const tenants = await findDueTenants(dbCtx, due);

  let removed = 0;
  const failed: string[] = [];
  for (const tenant of tenants) {
    const { operatorNotices } = appConfig.tenantKinds[tenant.kind];
    try {
      const counts = operatorNotices ? await countTenantRows(tenant.id) : [];
      const memberIds = await findMemberUserIdsByTenant(dbCtx, { tenantId: tenant.id });
      const deleted = await deleteDueTenant(dbCtx, { tenantId: tenant.id, ...due });
      // Restored, archived again or given more time since the listing: kept, and no mail.
      if (!deleted) continue;
      removed += 1;
      const orphaned = await findOrphanedAnonymousUserIds(dbCtx, { ids: memberIds });
      if (orphaned.length > 0) await deleteAccounts(dbCtx, { userIds: orphaned, by: null, dropActors: true });
      log.info('Tenant removed', { tenantId: tenant.id, kind: tenant.kind, counts, orphanedAccounts: orphaned.length });
      if (!operatorNotices) continue;
      const archivedAt = tenant.status === 'archived' ? tenant.statusChangedAt : (tenant.expiresAt ?? due.now);
      const statics = { tenantId: tenant.id, tenantName: tenant.name, archivedAt, removedAt: getIsoDate(), counts };
      await mailer
        .sendEmails(tenantRemovedEmail, statics, [{ email: appConfig.company.email, lng: appConfig.defaultLanguage }])
        .catch((err) => log.error('Failed to mail the removal of a tenant', { tenantId: tenant.id, err }));
    } catch (error) {
      failed.push(tenant.id);
      log.error('Removing a due tenant failed', { tenantId: tenant.id, err: error });
    }
  }

  if (failed.length > 0) throw new Error(`Removing due tenants failed for ${failed.length} tenant(s)`);
  return removed;
}
