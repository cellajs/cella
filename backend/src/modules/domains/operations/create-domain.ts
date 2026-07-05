import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findDomainByName, findTenantExists, insertDomain } from '#/modules/domains/domains-queries';
import { log } from '#/utils/logger';

export async function createDomainOp(ctx: AuthContext, domain: string) {
  const tenantId = ctx.var.tenantId;

  // Check tenant exists
  const tenant = await findTenantExists(ctx);
  if (!tenant) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
  }

  // Check domain not already claimed
  const existing = await findDomainByName(ctx, { domain });
  if (existing) {
    throw new AppError(409, 'invalid_request', 'warn', { meta: { reason: 'Domain already claimed' } });
  }

  const created = await insertDomain(ctx, { domain });

  log.info('Domain added', { tenantId, domain });

  return created;
}
