import { eq } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { domainsTable } from '#/modules/domains/domains-db';
import { type TenantModel, tenantsTable } from '#/modules/tenants/tenants-db';
import { utcStamp } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Creates a tenant with an associated domain claim, for self-serve creation during org onboarding. */
export async function createTenantForUser(
  db: DbOrTx,
  { name, createdBy, userEmail }: { name: string; createdBy: string; userEmail: string },
): Promise<TenantModel> {
  const [tenant] = await db.insert(tenantsTable).values({ name, createdBy }).returning();

  // Claim the user's email domain, unverified
  const domain = userEmail.split('@')[1];
  if (domain) {
    // Only insert if not already claimed by another tenant
    const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain)).limit(1);
    if (!existing) {
      await db.insert(domainsTable).values({ tenantId: tenant.id, domain });
    }
  }

  log.info('Tenant auto-created', { tenantId: tenant.id, name, createdBy });

  // Fire-and-forget security notification to sysadmin
  sendSecurityInboxEmail('tenant-created', {
    tenantName: name,
    userEmail,
    timestamp: utcStamp(),
  });

  return tenant;
}
