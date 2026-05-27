import type { AuthContext } from '#/core/context';
import { findDomainsByTenant } from '#/modules/domains/domains-queries';

export async function getDomainsOp(ctx: AuthContext) {
  return findDomainsByTenant(ctx);
}
