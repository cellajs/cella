import type { UserContext } from '#/core/context';
import { findDomainsByTenant } from '#/modules/domains/domains-queries';

export async function getDomainsOp(ctx: UserContext) {
  return findDomainsByTenant(ctx);
}
