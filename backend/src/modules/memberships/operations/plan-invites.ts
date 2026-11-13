import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType, EntityRole } from 'shared';
import type { UserContext } from '#/core/context';
import { findInvitationsByEmails } from '#/modules/memberships/invitations-queries';
import { findInviteeAccounts } from '#/modules/memberships/memberships-queries';
import type { inviteOutcomeSchema, membershipCheckBodySchema } from '#/modules/memberships/memberships-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { entityWithTypeSchema } from '#/schemas';

type InviteOutcome = z.infer<typeof inviteOutcomeSchema>;
type CheckInvitesInput = z.infer<typeof membershipCheckBodySchema> & z.infer<typeof entityWithTypeSchema>;
type StoredInvitation = Awaited<ReturnType<typeof findInvitationsByEmails>>[number];

/** One address with what an invite does with it, and the row the invite acts on; only the outcome goes on the wire. */
export type PlannedAddress =
  | { email: string; outcome: 'invite'; userId: string | null }
  | { email: string; outcome: 'add'; userId: string }
  | { email: string; outcome: 'resend'; invitation: StoredInvitation }
  | { email: string; outcome: 'declined'; invitation: StoredInvitation }
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
    findInvitationsByEmails(ctx, { emails: uniqueEmails, channelId: entity.id }),
  ]);
  const accountByEmail = new Map(accounts.map((account) => [account.email, account]));
  const invitationByEmail = new Map(invitations.map((invitation) => [invitation.email, invitation]));

  return uniqueEmails.map((email): PlannedAddress => {
    // An invitation goes out again; a declined one stays declined until the sweep removes it.
    const invitation = invitationByEmail.get(email);
    if (invitation?.status === 'declined') return { email, outcome: 'declined', invitation };
    if (invitation) return { email, outcome: 'resend', invitation };

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
  const { createdAt, declinedAt } = planned.invitation;
  if (planned.outcome === 'resend') return { email: planned.email, outcome: 'resend', invitedAt: createdAt };
  return { email: planned.email, outcome: 'declined', invitedAt: createdAt, declinedAt: declinedAt ?? undefined };
}

/**
 * What an invite would do with each address, for the invite form to show as addresses are added; nothing is written
 * or sent. It needs the same `update` an invite does. Every address that is not a member or invited before reads as a
 * new invitation: whether an organization member joins a channel at once depends on the role picked later.
 */
export async function checkInvitesOp(ctx: UserContext, { emails, entityId, entityType }: CheckInvitesInput) {
  const { entity } = await getValidChannel(ctx, entityId, entityType, 'update');

  const plan = await planInvites(ctx, { emails, entity, entityType, held: true });
  return { outcomes: plan.map((item) => toInviteOutcome(item.outcome === 'add' ? { ...item, outcome: 'invite' } : item)) };
}
