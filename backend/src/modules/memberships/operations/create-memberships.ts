import { type ChannelEntityType, type EntityRole, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { getMembershipEntityIds } from '#/modules/memberships/helpers/membership-helpers';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
import {
  countMembershipsByChannel,
  countPendingInvitesByChannel,
  insertInactiveMemberships,
  stampInactiveMembershipsReminded,
  updateInactiveMemberships,
} from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { type InvitedAddress, sendInvitationMails } from '#/modules/memberships/operations/invitation-mail';
import { type PlannedAddress, planInvites, toInviteOutcome } from '#/modules/memberships/operations/plan-invites';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

interface CreateMembershipsInput {
  emails: string[];
  role: EntityRole;
  entityId: string;
  entityType: ChannelEntityType;
}

type Planned<O extends PlannedAddress['outcome']> = Extract<PlannedAddress, { outcome: O }>;

/**
 * Invites each address as its plan says: a new invitation, the earlier one sent again (a declined one opens again, a
 * higher role replaces a lower one), an organization member added at once, or a member left out. Returns what happened
 * to each address.
 */
export async function createMembershipsOp(ctx: UserContext, input: CreateMembershipsInput) {
  const { db, user, organization, tenantId } = ctx.var;
  const { role, entityId, entityType } = input;
  const emails = [...new Set(input.emails.map((email) => email.toLowerCase().trim()))];

  // The invited role must exist in the target context's vocabulary (e.g. no org 'member' on a course)
  const channelRoles = hierarchy.getRoles(entityType);
  if (!channelRoles.includes(role)) throw new AppError(400, 'invalid_role', 'warn', { entityType });

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'update');

  // Draft context (publishedAt null): invites are recorded but emails are held and existing users are not added, all released at publish.
  // The channel's prepare roles (`drafts.prepareRoles` in the hierarchy) stay live so those people can set the draft up.
  const held = entity.publishedAt === null && !hierarchy.getPrepareRoles(entityType).includes(role);

  const plan = await planInvites(ctx, { emails, entity, entityType, held });
  const planned = <O extends PlannedAddress['outcome']>(outcome: O) => plan.filter((item): item is Planned<O> => item.outcome === outcome);
  const invites = planned('invite');
  const adds = planned('add');
  const reminders = planned('remind');
  const reopened = reminders.filter(({ invitation }) => invitation.rejectedAt);

  // Seats: new invitations, declined ones that open again and, at the organization, members added at once. A reminder
  // and a member take none.
  const newSeats = invites.length + reopened.length + (entityType === 'organization' ? adds.length : 0);
  const seatQuota = ctx.var.tenant.restrictions.quotas.user;
  if (seatQuota !== 0 && newSeats > 0) {
    const [members, pending] = await Promise.all([
      countMembershipsByChannel(ctx, { channelType: 'organization', channelId: organization.id }),
      countPendingInvitesByChannel(ctx, { channelType: 'organization', channelId: organization.id }),
    ]);
    if (members + pending + newSeats > seatQuota) throw new AppError(403, 'restrict_by_org', 'warn', { entityType });
  }

  const createdMemberships = adds.length
    ? await insertMemberships(
        { var: { db } },
        { items: adds.map(({ userId }) => ({ userId, role, entity: { ...entity, tenantId }, createdBy: user.id })) },
      )
    : [];
  for (const { userId } of adds) invalidateCache.user(userId);

  // A new invitation to an address no account holds carries a token's link; one an account holds is answered in-app.
  const inviteRows = invites.map(({ email, userId }) => ({
    id: generateId(),
    email,
    userId,
    role,
    createdBy: user.id,
    channelType: entityType,
    tenantId,
    ...getMembershipEntityIds(entity),
    channelId: entity.id,
  }));
  const inviteTokens = await issueTokens(
    ctx,
    inviteRows.flatMap(({ id, email, userId }) =>
      userId ? [] : [{ type: 'invitation' as const, email, createdBy: user.id, inactiveMembershipId: id }],
    ),
  );
  const insertedInvites = inviteRows.length ? await insertInactiveMemberships(ctx, { memberships: inviteRows }) : [];

  // Sent again: a declined invitation opens again, a higher role replaces a lower one, never the other way. A held
  // invitation goes out at publish, which sends only those without a last email.
  const raised = reminders.filter(({ invitation }) => invitation.role && channelRoles.indexOf(role) < channelRoles.indexOf(invitation.role));
  await updateInactiveMemberships(ctx, {
    ids: reopened.map(({ invitation }) => invitation.id),
    values: { rejectedAt: null, ...(held && { remindedAt: null }) },
  });
  await updateInactiveMemberships(ctx, { ids: raised.map(({ invitation }) => invitation.id), values: { role } });

  if (!held) {
    // A reminder to an address no account holds gets a fresh link, which retires the one mailed before.
    const reminderTokens = await issueTokens(
      ctx,
      reminders.flatMap(({ email, invitation }) =>
        invitation.userId ? [] : [{ type: 'invitation' as const, email, createdBy: user.id, inactiveMembershipId: invitation.id }],
      ),
    );
    const linkByEmail = new Map([...inviteTokens, ...reminderTokens].map(({ token, rawToken }) => [token.email, rawToken]));
    const toAddress = (email: string, userId: string | null): InvitedAddress => ({ email, userId, rawToken: linkByEmail.get(email) });

    // One mail batch per role: a reminder names the role its invitation holds, which may be higher than the one picked.
    const byRole = new Map<string, InvitedAddress[]>();
    const addTo = (mailRole: string, address: InvitedAddress) => byRole.set(mailRole, [...(byRole.get(mailRole) ?? []), address]);
    const insertedEmails = new Set(insertedInvites.map(({ email }) => email));
    for (const { email, userId } of invites) if (insertedEmails.has(email)) addTo(role, toAddress(email, userId));
    for (const { email, invitation } of reminders) {
      const raisedHere = raised.some((item) => item.email === email);
      addTo(raisedHere || !invitation.role ? role : invitation.role, toAddress(email, invitation.userId));
    }
    if (!byRole.has(role) && adds.length) byRole.set(role, []);

    for (const [mailRole, invited] of byRole) {
      await sendInvitationMails(ctx, {
        sender: user,
        channel: { type: entityType, slug: entity.slug, name: entity.name, role: mailRole as EntityRole },
        organization,
        invited,
        added: mailRole === role ? adds : [],
      });
    }

    const mailedIds = [...insertedInvites.map(({ id }) => id), ...reminders.map(({ invitation }) => invitation.id)];
    await stampInactiveMembershipsReminded(ctx, { ids: mailedIds, remindedAt: getIsoDate() });
  }

  log.info('Users invited on entity level', {
    invited: insertedInvites.length,
    reminded: reminders.length,
    added: adds.length,
    entityType,
    entityId,
  });

  return { data: createdMemberships.map((membership) => membershipAsSeenBy(membership, user.id)), outcomes: plan.map(toInviteOutcome), held };
}
