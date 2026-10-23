import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { findInvitationAccounts, findInvitationsToAddresses } from '#/modules/memberships/memberships-queries';
import type { inviteOutcomeSchema } from '#/modules/memberships/memberships-schema';

type InviteOutcome = z.infer<typeof inviteOutcomeSchema>;
type Invitation = Awaited<ReturnType<typeof findInvitationsToAddresses>>[number];

/** One address with what an invite does with it, and the rows the invite acts on. Only `outcome` goes on the wire. */
export type PlannedAddress =
  | { email: string; outcome: 'invite'; userId: string | null }
  | { email: string; outcome: 'add'; userId: string }
  | { email: string; outcome: 'remind'; invitation: Invitation }
  | { email: string; outcome: 'member'; role: string };

interface PlanInvitesInput {
  emails: string[];
  entity: { id: string };
  entityType: ChannelEntityType;
  /** Invitations to this draft wait for its publish, so nobody joins it at once. */
  held: boolean;
}

/**
 * What an invite does with each address. Anyone may invite any address, so the answer rests only on what the inviter
 * already sees: the channel's invitations by address and its members by their listed (primary) address. An account
 * behind an address picks the email and whether a token is minted, never the answer.
 */
export async function planInvites(ctx: UserContext, { emails, entity, entityType, held }: PlanInvitesInput): Promise<PlannedAddress[]> {
  const { user, isSystemAdmin } = ctx.var;

  const [accounts, invitations] = await Promise.all([
    findInvitationAccounts(ctx, { emails, entityType, entityId: entity.id }),
    findInvitationsToAddresses(ctx, { emails, channelId: entity.id }),
  ]);
  const accountByEmail = new Map(accounts.map((account) => [account.email, account]));
  const invitationByEmail = new Map(invitations.map((invitation) => [invitation.email, invitation]));

  return emails.map((email): PlannedAddress => {
    // A pending invitation goes out again; a declined one opens again.
    const invitation = invitationByEmail.get(email);
    if (invitation) return { email, outcome: 'remind', invitation };

    const account = accountByEmail.get(email);
    if (!account) return { email, outcome: 'invite', userId: null };

    const isListedAddress = account.primaryEmail === email;
    if (account.membershipId && account.membershipRole && isListedAddress) return { email, outcome: 'member', role: account.membershipRole };

    // An organization member invited below the organization by their listed address joins at once, unless the channel
    // is a draft that holds the role: then nobody joins before its publish.
    const joinsDirectly = entityType !== 'organization' && !!account.orgMembershipId && isListedAddress && !held;
    const isAdminInvitingSelf = user.email === email && isSystemAdmin;
    if (joinsDirectly || isAdminInvitingSelf) return { email, outcome: 'add', userId: account.userId };

    return { email, outcome: 'invite', userId: account.userId };
  });
}

/** The wire form of a plan: what the inviter may know about each address. */
export const toInviteOutcome = (planned: PlannedAddress): InviteOutcome => {
  if (planned.outcome === 'member') return { email: planned.email, outcome: 'member', role: planned.role as InviteOutcome['role'] };
  if (planned.outcome !== 'remind') return { email: planned.email, outcome: planned.outcome };
  const { createdAt, rejectedAt } = planned.invitation;
  return { email: planned.email, outcome: 'remind', invitedAt: createdAt, ...(rejectedAt && { declinedAt: rejectedAt }) };
};
