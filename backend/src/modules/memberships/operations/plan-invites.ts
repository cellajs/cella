import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType, EntityRole } from 'shared';
import { declineHolds } from 'shared/decline-hold';
import type { UserContext } from '#/core/context';
import { findInactiveMembershipsByEmails } from '#/modules/memberships/inactive-memberships-queries';
import { findInviteeAccounts } from '#/modules/memberships/memberships-queries';
import type { inviteOutcomeSchema } from '#/modules/memberships/memberships-schema';

type InviteOutcome = z.infer<typeof inviteOutcomeSchema>;
type InactiveMembership = Awaited<ReturnType<typeof findInactiveMembershipsByEmails>>[number];

/**
 * One address with what an invite does with it, and the rows the invite acts on. Only `outcome` goes on the wire, where
 * a `declined` one, left alone while its decline holds, reads as the `remind` it was.
 */
export type PlannedAddress =
  | { email: string; outcome: 'invite'; userId: string | null }
  | { email: string; outcome: 'add'; userId: string }
  | { email: string; outcome: 'remind'; invitation: InactiveMembership }
  | { email: string; outcome: 'declined'; invitation: InactiveMembership }
  | { email: string; outcome: 'member'; role: EntityRole };

interface PlanInvitesInput {
  /** Trimmed and lowercased, as the body schema leaves them; a repeat is planned once. */
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
  const uniqueEmails = [...new Set(emails)];

  const [accounts, invitations] = await Promise.all([
    findInviteeAccounts(ctx, { emails: uniqueEmails, entityType, entityId: entity.id }),
    findInactiveMembershipsByEmails(ctx, { emails: uniqueEmails, channelId: entity.id }),
  ]);
  const accountByEmail = new Map(accounts.map((account) => [account.email, account]));
  const invitationByEmail = new Map(invitations.map((invitation) => [invitation.email, invitation]));

  return uniqueEmails.map((email): PlannedAddress => {
    // A pending invitation goes out again, and a declined one opens again once its decline stops holding.
    const invitation = invitationByEmail.get(email);
    if (invitation && declineHolds(invitation.rejectedAt)) return { email, outcome: 'declined', invitation };
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
export function toInviteOutcome(planned: PlannedAddress): InviteOutcome {
  if (planned.outcome === 'member') return { email: planned.email, outcome: 'member', role: planned.role };
  if (planned.outcome === 'invite' || planned.outcome === 'add') return { email: planned.email, outcome: planned.outcome };
  const { createdAt, rejectedAt } = planned.invitation;
  return { email: planned.email, outcome: 'remind', invitedAt: createdAt, ...(rejectedAt && { declinedAt: rejectedAt }) };
}
