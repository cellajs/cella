import type { DbContext } from '#/core/context';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import { insertTenant } from '#/modules/tenants/tenants-queries';
import { log } from '#/utils/logger';

/** Creates a tenant for self-serve creation during organization onboarding; the creator's address goes in the security notice. */
export async function createTenant(
  ctx: DbContext,
  { name, createdBy, userEmail }: { name: string; createdBy: string; userEmail: string },
): Promise<TenantModel> {
  const tenant = await insertTenant(ctx, { values: { name, createdBy } });

  log.info('Tenant auto-created', { tenantId: tenant.id, name, createdBy });

  // Fire-and-forget security notification to sysadmin
  sendSecurityInboxEmail('tenant-created', { tenantName: name, userEmail });

  return tenant;
}
