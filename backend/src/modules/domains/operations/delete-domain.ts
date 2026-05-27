import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteDomain } from '#/modules/domains/domains-queries';
import { logEvent } from '#/utils/logger';

export async function deleteDomainOp(ctx: AuthContext, id: string) {
  const tenantId = ctx.var.tenantId;

  const deleted = await deleteDomain(ctx, { id });

  if (!deleted) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
  }

  logEvent(ctx, 'info', 'Domain removed', { tenantId, domain: deleted.domain });

  return deleted;
}
