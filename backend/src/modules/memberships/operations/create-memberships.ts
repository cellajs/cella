import type { z } from '@hono/zod-openapi';
import { buildSubject, buildSubjectFromEntity, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { channelIdColumnsOf, findMenuParent, isHeldInvitation, membershipsBroughtAlong } from '#/modules/memberships/helpers/membership-helpers';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
import { insertInvitations, raiseInvitations } from '#/modules/memberships/invitations-queries';
import type { membershipCreateBodySchema } from '#/modules/memberships/memberships-schema';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { mailWithinCaps } from '#/modules/memberships/operations/mail-invitations';
import { hasFreeSeats } from '#/modules/memberships/operations/organization-seats';
import { type PlannedAddress, planInvites, toInviteOutcome } from '#/modules/memberships/operations/plan-invites';
import { sendInvitationMails } from '#/modules/memberships/operations/send-invitation-mails';
import { takeInvitationMails } from '#/modules/memberships/operations/take-invitation-mails';
import { assertTenantInvites } from '#/modules/tenants/tenant-restrictions';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { assertRoleGrant } from '#/permissions/role-grant';
import { assertReadsPeople } from '#/permissions/visible-people';
import type { channelRefSchema } from '#/schemas';
import { log } from '#/utils/logger';

type CreateMembershipsInput = z.infer<typeof membershipCreateBodySchema> & z.infer<typeof channelRefSchema>;

type Planned<O extends PlannedAddress['outcome']> = Extract<PlannedAddress, { outcome: O }>;

/**
 * Invites each address as its plan says, for an inviter who may update the channel and read its people: a new invitation, the earlier one sent again (a higher role replaces a lower
 * one), an organization member added at once, or a declined invitation or a member left out.
 * An address the tenant mailed in the last day gets no mail; past the tenant's daily mails nothing is done. Returns
 * what happened to each address.
 */
export async function createMembershipsOp(ctx: UserContext, { emails, role, channelId, channelType }: CreateMembershipsInput) {
  const { db, user, organization, tenantId } = ctx.var;

  const channelRoles = hierarchy.getRoles(channelType);
  if (!channelRoles.includes(role)) throw new AppError(400, 'invalid_role', 'warn', { entityType: channelType });

  const { entity } = await getValidChannel(ctx, channelId, channelType, 'update');
  assertReadsPeople(ctx, channelType, entity);
  assertTenantInvites(ctx.var.tenant);

  // The memberships an accept brings along above the channel are checked here too: the accept has no inviter to ask.
  assertRoleGrant(ctx, { subject: buildSubjectFromEntity(channelType, entity), role, action: 'update' });
  for (const along of membershipsBroughtAlong(entity, role, findMenuParent(channelType))) {
    const subject = buildSubject(along.channelType, channelIdColumnsOf(entity), { id: along.channelId });
    assertRoleGrant(ctx, { subject, role: along.role, action: 'update' });
  }

  // Held: invites are recorded but emails are held and existing users are not added, all released at publish.
  const held = isHeldInvitation(channelType, entity, role);

  const plan = await planInvites(ctx, { emails, entity, channelType, held });
  const planned = <O extends PlannedAddress['outcome']>(outcome: O) => plan.filter((item): item is Planned<O> => item.outcome === outcome);
  const invites = planned('invite');
  const adds = planned('add');
  const resends = planned('resend');
  // A higher role replaces a lower one, never the other way. Unheld, a raise releases a held invitation to go out now.
  const raised = resends.filter(({ invitation }) => channelRoles.indexOf(role) < channelRoles.indexOf(invitation.role));
  const raisedIds = new Set(raised.map(({ invitation }) => invitation.id));

  // Seats: new invitations and, at the organization, members added at once. A resend and a member take none.
  const seatTakers = [...invites, ...(channelType === 'organization' ? adds : [])];

  // A held invitation is mailed once at its channel's publish, so it counts toward the tenant's day now.
  const mailedAgain = resends.filter(({ invitation }) => invitation.status === 'pending' || raisedIds.has(invitation.id));
  const mailNow = held ? [] : [...invites, ...mailedAgain].map(({ email }) => email);

  // One transaction: the seats are counted under the lock a launch and an import count under, and what a module writes
  // for a membership (`membershipColumns`) commits with it.
  const { createdMemberships, inserted, taken } = await db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const seats = {
      tenantId,
      organizationId: organization.id,
      quota: ctx.var.tenant.restrictions.quotas.user,
      seats: seatTakers.length,
      // A second invitation costs no second seat: an address this request charges is left out of the pending count.
      exceptEmails: seatTakers.map(({ email }) => email),
    };
    if (!(await hasFreeSeats(txCtx, seats))) throw new AppError(403, 'restrict_by_org', 'warn', { entityType: channelType });

    const taken = await takeInvitationMails(ctx, { mailNow, mailAtPublish: held ? invites.length : 0 });
    const createdMemberships = await insertMemberships(txCtx, {
      items: adds.map(({ userId }) => ({ userId, role, entity: { ...entity, tenantId }, createdBy: user.id })),
    });
    const inserted = await insertInvitations(txCtx, {
      invitations: invites.map(({ email, userId }) => ({
        id: generateId(),
        email,
        userId,
        role,
        status: held ? 'held' : 'pending',
        createdBy: user.id,
        channelType,
        tenantId,
        ...channelIdColumnsOf(entity),
        channelId: entity.id,
      })),
    });
    await raiseInvitations(txCtx, { ids: [...raisedIds], role, by: user.id, release: !held });
    return { createdMemberships, inserted, taken };
  });
  for (const { userId } of adds) invalidateCache.user(userId);

  if (!held) {
    // New invitations and resends go out alike: a resend names the role its invitation holds now, and its inviter.
    const invitations = [...inserted, ...mailedAgain.map(({ invitation }) => invitation)];
    await mailWithinCaps(ctx, { invitations, organization, by: user.id, taken });

    if (adds.length) {
      const channel = { channelType, channelId: entity.id, tenantId, organizationId: organization.id, name: entity.name, role };
      await sendInvitationMails(ctx, { sender: user, channel, organization, invited: [], added: adds });
    }
  }

  log.info('Users invited on entity level', {
    invited: inserted.length,
    resent: resends.length,
    added: adds.length,
    channelType,
    channelId,
  });

  return { results: createdMemberships.map((membership) => membershipAsSeenBy(membership, user.id)), outcomes: plan.map(toInviteOutcome), held };
}
