import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findDomainById } from '#/modules/domains/domains-queries';

export async function getDomainOp(ctx: UserContext, id: string) {
  const domain = await findDomainById(ctx, { id });

  if (!domain) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'domain' } });
  }

  return domain;
}
