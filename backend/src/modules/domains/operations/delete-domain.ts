import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteDomain } from '#/modules/domains/domains-queries';
import { log } from '#/utils/logger';

export async function deleteDomainOp(ctx: UserContext, id: string) {
  const tenantId = ctx.var.tenantId;

  const deleted = await deleteDomain(ctx, { id });

  if (!deleted) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
  }

  log.info('Domain removed', { tenantId, domain: deleted.domain });

  return deleted;
}
