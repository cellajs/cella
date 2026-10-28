import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import {
  bindInactiveMemberships,
  deleteInactiveMembership,
  findClaimableInactiveMembership,
  findInactiveMembershipForUser,
  stampInactiveMembershipRejected,
} from '#/modules/memberships/inactive-memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { channelBaseSchema } from '#/schemas/entity-base';
import { log } from '#/utils/logger';
import { pick } from '#/utils/pick';

interface HandleMembershipInvitationOpts {
  /**
   * The caller proved possession of the invitation's emailed token. Only then may an invitation not yet bound to a
   * user be answered; by id alone an invitation stays answerable by its bound user only (GHSA-fmh4-wcc4-5jm3).
   */
  viaToken?: boolean;
}

/**
 * Answers an invitation for the signed-in user. Accepting makes them a member of its channel, or spends it when they
 * are one already; rejecting declines it. Either way its links go, and the answer is its organization as `ChannelBase`.
 * @throws AppError 404 `not_found` for a missing, rejected or another user's invitation alike, 409 `user_mismatch` when
 * a token accept loses the bind to another account.
 */
export async function handleMembershipInvitationOp(
  ctx: UserContext,
  inactiveMembershipId: string,
  acceptOrReject: 'accept' | 'reject',
  { viaToken = false }: HandleMembershipInvitationOpts = {},
) {
  const userId = ctx.var.user.id;

  const inactiveMembership = viaToken
    ? await findClaimableInactiveMembership(ctx, { id: inactiveMembershipId })
    : await findInactiveMembershipForUser(ctx, { id: inactiveMembershipId });

  // Missing, rejected and another user's alike (PERMISSIONS.md, Refusals).
  if (!inactiveMembership) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation', id: inactiveMembershipId } });
  }

  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    if (acceptOrReject === 'accept') {
      if (viaToken) {
        // Bind before activating: of two accounts racing for the same unbound invitation, exactly one wins.
        const [bound] = await bindInactiveMemberships(txCtx, { ids: [inactiveMembership.id], userId });
        if (!bound) throw new AppError(409, 'user_mismatch', 'warn', { meta: { id: inactiveMembership.id } });
      }

      const entity = await resolveEntity(txCtx, { entityType: inactiveMembership.channelType, identifier: inactiveMembership.channelId });
      if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: inactiveMembership.channelType });

      // Invited on another address while already a member: the invitation is spent, the membership stays as it is.
      const alreadyMember = ctx.var.memberships.some((m) => m.channelId === inactiveMembership.channelId);

      const activatedMemberships = alreadyMember
        ? []
        : await insertMemberships(txCtx, { items: [{ entity, userId, role: inactiveMembership.role, createdBy: inactiveMembership.createdBy }] });

      await deleteInactiveMembership(txCtx, { id: inactiveMembership.id });
      // The emailed link has no further use once the invitation is answered.
      await deleteInvitationTokens(txCtx, { inactiveMembershipIds: [inactiveMembership.id] });

      log.info('Membership accepted', { ids: activatedMemberships.map((m) => m.id), viaToken, alreadyMember });
    }

    if (acceptOrReject === 'reject') {
      await stampInactiveMembershipRejected(txCtx, { id: inactiveMembership.id });
      await deleteInvitationTokens(txCtx, { inactiveMembershipIds: [inactiveMembership.id] });
    }
  });
  if (acceptOrReject === 'accept') invalidateCache.user(userId);

  const organization = await resolveEntity(ctx, { entityType: 'organization', identifier: inactiveMembership.organizationId });
  if (!organization) throw new AppError(404, 'not_found', 'error', { entityType: 'organization' });

  // The invitee may have declined and is no member: the answer names the organization, never its settings or writers.
  return pick(organization, channelBaseSchema.keyof().options);
}
