import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { findPendingMembershipsPaginated } from '#/modules/memberships/memberships-queries';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { getValidChannel } from '#/permissions/get-valid-channel';

interface GetPendingMembershipsInput {
  entityId: string;
  entityType: ChannelEntityType;
  sort?: 'createdAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

/**
 * Pending invitations of a channel, for anyone who may read it: members already see every member's address. The
 * invitation's token id, which a resend targets, goes only to callers with `update` on the channel, the grant a
 * resend needs.
 */
export async function getPendingMembershipsOp(ctx: UserContext, input: GetPendingMembershipsInput) {
  const organization = ctx.var.organization;

  const { entityId, entityType, sort, order, offset, limit } = input;
  const { entity } = await getValidChannel(ctx, entityId, entityType, 'read');
  const { allowed: mayResend } = checkAccess(accessFrom(ctx), 'update', buildSubjectFromEntity(entityType, entity));

  const { items: rawItems, total } = await findPendingMembershipsPaginated(ctx, {
    organizationId: organization.id,
    entityId: entity.id,
    sort,
    order,
    offset,
    limit,
  });

  // The declared shape only: `userId` would tell which invited addresses already hold an account.
  const projected = rawItems.map(({ userId: _userId, tokenId, ...item }) => (mayResend ? { ...item, tokenId } : item));
  const items = await withAuditUsers(ctx, projected);

  return { items, total };
}
