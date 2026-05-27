import type { EntityType } from 'shared';
import { AppError } from '#/core/error';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { signYjsToken } from '../helpers/token-signer';

export function getYjsTokenOp(
  userId: string,
  memberships: MembershipBaseModel[],
  params: { entityType: string; tenantId: string; organizationId: string },
) {
  const { entityType, tenantId, organizationId } = params;

  // Org-level gate only: verify the user is a member of this organization.
  // Per-entity access (project/task level) is enforced by the relay worker's
  // verify-entity callback before allowing any writes.
  const hasOrgMembership = memberships.some((m) => m.organizationId === organizationId);
  if (!hasOrgMembership) throw new AppError(403, 'forbidden', 'warn', { entityType: entityType as EntityType });

  const token = signYjsToken({
    userId,
    entityType,
    tenantId,
    organizationId,
  });

  return { token };
}
