import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { withCreatorRefs } from '#/modules/actors/actor-refs';
import { tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { findInvitationsPaginated } from '#/modules/memberships/invitations-queries';
import type { invitationListQuerySchema } from '#/modules/memberships/memberships-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { PageWindow } from '#/utils/list-page';

type ListInvitationsInput = z.infer<typeof invitationListQuerySchema>;

/**
 * A channel's held and pending invitations, for anyone who may read it: members already see every member's address.
 * Each row names the address the invitation went to and nothing about an account that may hold it, not even whether a
 * token was minted, since anyone may create an organization and invite any address. A resend names the row by its id.
 */
export async function listInvitationsOp(ctx: UserContext, input: ListInvitationsInput, { offset, limit }: PageWindow) {
  const { entityId, entityType, orderBy } = input;
  const { entity } = await getValidChannel(ctx, entityId, entityType, 'read');

  const { items: rawItems, total } = await findInvitationsPaginated(ctx, {
    organizationId: ctx.var.organization.id,
    entityId: entity.id,
    ...orderBy,
    offset,
    limit,
  });

  // From the last email, never the token: only an address no account holds has one, and a row may not tell them apart.
  const linkMs = tokenPolicies.invitation.ttl.milliseconds();
  const withExpiry = rawItems.map((item) => ({
    ...item,
    linkExpiresAt: item.mailedAt ? new Date(Date.parse(item.mailedAt) + linkMs).toISOString() : null,
  }));

  return { items: await withCreatorRefs(ctx, withExpiry), total };
}
