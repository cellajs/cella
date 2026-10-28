import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findPendingMembershipsPaginated } from '#/modules/memberships/inactive-memberships-queries';
import type { pendingMembershipListQuerySchema } from '#/modules/memberships/memberships-schema';
import { getValidChannel } from '#/permissions';

type GetPendingMembershipsInput = z.infer<typeof pendingMembershipListQuerySchema>;

/**
 * Pending invitations of a channel, for anyone who may read it: members already see every member's address. Each row
 * names the address the invitation went to and nothing about an account that may hold it, not even whether a token was
 * minted, since anyone may create an organization and invite any address. A resend names the row by its own id.
 */
export async function getPendingMembershipsOp(ctx: UserContext, input: GetPendingMembershipsInput) {
  const organization = ctx.var.organization;

  const { entityId, entityType, sort, order, offset, limit } = input;
  const { entity } = await getValidChannel(ctx, entityId, entityType, 'read');

  const { items: rawItems, total } = await findPendingMembershipsPaginated(ctx, {
    organizationId: organization.id,
    entityId: entity.id,
    sort,
    order,
    offset,
    limit,
  });

  const items = await withActorRefs(ctx, rawItems);

  return { items, total };
}
