import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbOrTx } from '#/db/db';
import { domainsTable } from '#/db/schema/domains';
import { type TenantModel, tenantsTable } from '#/db/schema/tenants';
import { sendAccountSecurityEmail } from '#/lib/send-account-security-email';
import { logEvent } from '#/utils/logger';

/**
 * Shared utility for creating a tenant with associated domain.
 * Used by both system admin tenant creation and auto-tenant creation during org onboarding.
 */
export async function createTenantForUser(
  db: DbOrTx,
  { name, createdBy, userEmail }: { name: string; createdBy: string; userEmail: string },
): Promise<TenantModel> {
  const [tenant] = await db.insert(tenantsTable).values({ name, createdBy }).returning();

  // Extract domain from user email and insert as unverified domain claim
  const domain = userEmail.split('@')[1];
  if (domain) {
    // Only insert if not already claimed by another tenant
    const [existing] = await db.select().from(domainsTable).where(eq(domainsTable.domain, domain)).limit(1);
    if (!existing) {
      await db.insert(domainsTable).values({ tenantId: tenant.id, domain });
    }
  }

  logEvent('info', 'Tenant auto-created', { tenantId: tenant.id, name, createdBy });

  // Fire-and-forget security notification to sysadmin
  sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'tenant-created', {
    tenantName: name,
    userEmail,
    timestamp: new Date().toISOString(),
  });

  return tenant;
}
