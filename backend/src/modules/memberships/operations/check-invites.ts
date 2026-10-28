import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { planInvites, toInviteOutcome } from '#/modules/memberships/operations/plan-invites';
import { getValidChannel } from '#/permissions';

interface CheckInvitesInput {
  emails: string[];
  entityId: string;
  entityType: ChannelEntityType;
}

/**
 * What an invite would do with each address, for the invite form to show as addresses are added; nothing is written
 * or sent. It needs the same `update` an invite does. Whether an organization member joins a channel at once depends on
 * the role picked later, so here every address that is not a member or invited before reads as a new invitation.
 */
export async function checkInvitesOp(ctx: UserContext, { emails, entityId, entityType }: CheckInvitesInput) {
  const { entity } = await getValidChannel(ctx, entityId, entityType, 'update');

  const plan = await planInvites(ctx, { emails, entity, entityType, held: true });
  return { outcomes: plan.map((item) => toInviteOutcome(item.outcome === 'add' ? { ...item, outcome: 'invite' } : item)) };
}
