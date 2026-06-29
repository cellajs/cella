import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findDomain } from '#/modules/domains/domains-queries';

export async function getDomainOp(ctx: AuthContext, id: string) {
  const domain = await findDomain(ctx, { id });

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
  }

  return domain;
}
