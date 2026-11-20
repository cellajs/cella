import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { countLtiConnections } from '#/modules/connections/connections-queries';
import type { TenantModel } from '#/modules/tenants/tenants-db';

/**
 * Refuses a new LTI connection in a tenant that holds as many as its quota allows (`restrictions.quotas.ltiConnection`),
 * pending ones included. Where a connection is inserted it runs under `lockTenantQuota`.
 * @throws AppError 403 `lti_connection_limit` with the cap in `meta.quota`.
 */
export async function assertLtiConnectionRoom(ctx: DbContext, tenant: Pick<TenantModel, 'id' | 'restrictions'>): Promise<void> {
  const quota = tenant.restrictions.quotas.ltiConnection;
  if (quota === 'unlimited' || (await countLtiConnections(ctx, { tenantId: tenant.id })) < quota) return;
  throw new AppError(403, 'lti_connection_limit', 'info', { meta: { quota } });
}
