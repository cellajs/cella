import type { ProductEntityType } from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { signYjsToken } from '../helpers/token-signer';

export function getYjsTokenOp(
  userId: string,
  memberships: MembershipBaseModel[],
  params: { entityType: ProductEntityType; tenantId: string; organizationId: string },
) {
  const { entityType, tenantId, organizationId } = params;

  // Org-level gate only: per-entity access is enforced by the relay worker running the shared permission engine.
  const hasOrgMembership = memberships.some((m) => m.organizationId === organizationId);
  if (!hasOrgMembership) throw new AppError(403, 'forbidden', 'warn', { entityType });

  const token = signYjsToken({
    userId,
    entityType,
    tenantId,
    organizationId,
  });

  return { token };
}
