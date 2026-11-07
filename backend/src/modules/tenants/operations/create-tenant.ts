import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import { insertTenant } from '#/modules/tenants/tenants-queries';
import { log } from '#/utils/logger';

/**
 * Creates a `live` tenant for self-serve creation during organization onboarding; the creator's address goes in the
 * security notice, for a kind the operator hears of.
 */
export async function createTenant(
  ctx: DbContext,
  { name, createdBy, userEmail }: { name: string; createdBy: string; userEmail: string },
): Promise<TenantModel> {
  const tenant = await insertTenant(ctx, { values: { name, createdBy } });

  log.info('Tenant auto-created', { tenantId: tenant.id, name, createdBy });

  // Any signed-in user creates tenants, so the notice is throttled per creator.
  if (appConfig.tenantKinds[tenant.kind].operatorNotices) await sendSecurityInboxEmail('tenant-created', { tenantName: name, userEmail }, createdBy);

  return tenant;
}
