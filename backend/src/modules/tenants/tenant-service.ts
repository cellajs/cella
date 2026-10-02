import type { DbOrTx } from '#/db/db';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { type TenantModel, tenantsTable } from '#/modules/tenants/tenants-db';
import { utcStamp } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Creates a tenant for self-serve creation during organization onboarding; the creator's address goes in the security notice. */
export async function createTenantForUser(
  db: DbOrTx,
  { name, createdBy, userEmail }: { name: string; createdBy: string; userEmail: string },
): Promise<TenantModel> {
  const [tenant] = await db.insert(tenantsTable).values({ name, createdBy }).returning();

  log.info('Tenant auto-created', { tenantId: tenant.id, name, createdBy });

  // Fire-and-forget security notification to sysadmin
  sendSecurityInboxEmail('tenant-created', { tenantName: name, userEmail, timestamp: utcStamp() });

  return tenant;
}
