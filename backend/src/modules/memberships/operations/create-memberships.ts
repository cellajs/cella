import type { z } from '@hono/zod-openapi';
import { buildSubject, buildSubjectFromEntity, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { channelIdColumnsOf, findMenuParent, isHeldInvitation, membershipsBroughtAlong } from '#/modules/memberships/helpers/membership-helpers';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
import {
  countPendingInactiveMembershipSeats,
  insertInactiveMemberships,
  updateInactiveMemberships,
} from '#/modules/memberships/inactive-memberships-queries';
import { countMembershipsByChannel } from '#/modules/memberships/memberships-queries';
import type { membershipCreateBodySchema } from '#/modules/memberships/memberships-schema';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { mailInvitations } from '#/modules/memberships/operations/mail-invitations';
import { type PlannedAddress, planInvites, toInviteOutcome } from '#/modules/memberships/operations/plan-invites';
import { sendInvitationMails } from '#/modules/memberships/operations/send-invitation-mails';
import { refundInvitationMails, takeInvitationMails } from '#/modules/memberships/operations/take-invitation-mails';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { assertRoleGrant } from '#/permissions/role-grant';
import type { entityWithTypeSchema } from '#/schemas';
import { log } from '#/utils/logger';

type CreateMembershipsInput = z.infer<typeof membershipCreateBodySchema> & z.infer<typeof entityWithTypeSchema>;

type Planned<O extends PlannedAddress['outcome']> = Extract<PlannedAddress, { outcome: O }>;

/**
 * Invites each address as its plan says: a new invitation, the earlier one sent again (a declined one opens again once
 * its decline stops holding, a higher role replaces a lower one), an organization member added at once, or a member
 * left out. An address the tenant mailed in the last day gets no mail; past the tenant's daily mails nothing is done.
 * Returns what happened to each address.
 */
export async function createMembershipsOp(ctx: UserContext, input: CreateMembershipsInput) {
  const { db, user, organization, tenantId } = ctx.var;
  const { emails, role, entityId, entityType } = input;

  const channelRoles = hierarchy.getRoles(entityType);
  if (!channelRoles.includes(role)) throw new AppError(400, 'invalid_role', 'warn', { entityType });

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'update');

  // The memberships an accept brings along above the channel are checked here too: the accept has no inviter to ask.
  assertRoleGrant(ctx, { subject: buildSubjectFromEntity(entityType, entity), role, action: 'update' });
  for (const along of membershipsBroughtAlong(entity, role, findMenuParent(entityType))) {
    const subject = buildSubject(along.channelType, channelIdColumnsOf(entity), { id: along.channelId });
    assertRoleGrant(ctx, { subject, role: along.role, action: 'update' });
  }

  // Held: invites are recorded but emails are held and existing users are not added, all released at publish.
  const held = isHeldInvitation(entityType, entity, role);

  const plan = await planInvites(ctx, { emails, entity, entityType, held });
  const planned = <O extends PlannedAddress['outcome']>(outcome: O) => plan.filter((item): item is Planned<O> => item.outcome === outcome);
  const invites = planned('invite');
  const adds = planned('add');
  const reminders = planned('remind');
  const reopened = reminders.filter(({ invitation }) => invitation.rejectedAt);

  // Seats: new invitations, declined ones that open again and, at the organization, members added at once. A reminder
  // and a member take none.
  const seatTakers = [...invites, ...reopened, ...(entityType === 'organization' ? adds : [])];
  const newSeats = seatTakers.length;
  const seatQuota = ctx.var.tenant.restrictions.quotas.user;
  if (seatQuota !== 0 && newSeats > 0) {
    const [members, pending] = await Promise.all([
      countMembershipsByChannel(ctx, { channelType: 'organization', channelId: organization.id }),
      // An address this request charges is left out of the pending count, so a second invitation costs no second seat.
      countPendingInactiveMembershipSeats(ctx, { organizationId: organization.id, exceptEmails: seatTakers.map(({ email }) => email) }),
    ]);
    if (members + pending + newSeats > seatQuota) throw new AppError(403, 'restrict_by_org', 'warn', { entityType });
  }

  // A held invitation is mailed once at its channel's publish, so it counts toward the tenant's day now.
  const mailNow = held ? [] : [...invites, ...reminders].map(({ email }) => email);
  const mailHeldBack = await takeInvitationMails(ctx, { mailNow, mailAtPublish: held ? invites.length + reopened.length : 0 });

  // One transaction: what a module writes for a membership (`membershipColumns`) commits with it.
  const createdMemberships = adds.length
    ? await db.transaction((tx) =>
        insertMemberships(
          { var: { db: tx } },
          { items: adds.map(({ userId }) => ({ userId, role, entity: { ...entity, tenantId }, createdBy: user.id })) },
        ),
      )
    : [];
  for (const { userId } of adds) invalidateCache.user(userId);

  const insertedInvites = await insertInactiveMemberships(ctx, {
    memberships: invites.map(({ email, userId }) => ({
      id: generateId(),
      email,
      userId,
      role,
      createdBy: user.id,
      channelType: entityType,
      tenantId,
      ...channelIdColumnsOf(entity),
      channelId: entity.id,
    })),
  });

  // Sent again: a declined invitation opens again, a higher role replaces a lower one, never the other way. A held
  // invitation goes out at publish, which sends only those without a last email.
  const raised = reminders.filter(({ invitation }) => channelRoles.indexOf(role) < channelRoles.indexOf(invitation.role));
  await updateInactiveMemberships(ctx, {
    ids: reopened.map(({ invitation }) => invitation.id),
    values: { rejectedAt: null, ...(held && { remindedAt: null }) },
  });
  await updateInactiveMemberships(ctx, { ids: raised.map(({ invitation }) => invitation.id), values: { role } });

  if (!held) {
    // New invitations and reminders go out alike: a reminder names the role its invitation holds now, and its inviter.
    const toMail = [...insertedInvites, ...reminders.map(({ invitation }) => invitation)].filter(({ email }) => !mailHeldBack.has(email));
    const mailed = new Set((await mailInvitations(ctx, { ids: toMail.map(({ id }) => id), organization })).map(({ email }) => email));
    // An address whose mail did not go out gets its day back.
    await refundInvitationMails(
      ctx,
      mailNow.filter((email) => !mailHeldBack.has(email) && !mailed.has(email)),
    );

    if (adds.length) {
      const channel = { type: entityType, id: entity.id, tenantId, organizationId: organization.id, name: entity.name, role };
      await sendInvitationMails(ctx, { sender: user, channel, organization, invited: [], added: adds });
    }
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
