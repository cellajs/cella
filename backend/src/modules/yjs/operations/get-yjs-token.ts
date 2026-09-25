import type { ProductEntityType } from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { signYjsToken } from '../helpers/token-signer';

/**
 * Signs a Yjs token for the caller in an organization they are a member of. The signed tenant is the organization's
 * own, taken from the membership: the relay scopes the session by it, so a query naming another tenant is refused.
 */
export function getYjsTokenOp(
  userId: string,
  memberships: MembershipBaseModel[],
  params: { entityType: ProductEntityType; tenantId: string; organizationId: string },
) {
  const { entityType, tenantId, organizationId } = params;

  // Org-level gate only: per-entity access is enforced by the relay worker running the shared permission engine.
  const membership = memberships.find((m) => m.organizationId === organizationId);
  if (!membership || membership.tenantId !== tenantId) throw new AppError(403, 'forbidden', 'warn', { entityType });

  const token = signYjsToken({
    userId,
    entityType,
    tenantId: membership.tenantId,
    organizationId,
  });

  return { token };
}
