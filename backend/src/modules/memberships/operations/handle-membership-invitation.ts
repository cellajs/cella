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
  stampInactiveMembershipDeclined,
} from '#/modules/memberships/inactive-memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { isProvenAccount } from '#/modules/user/user-queries';
import { channelBaseSchema } from '#/schemas/entity-base';
import { log } from '#/utils/logger';
import { pick } from '#/utils/pick';

/** What answering an invitation reads of the user's request; a sign-in builds it before the user has a session. */
export type InvitationAnswerContext = { var: Pick<UserContext['var'], 'db' | 'user' | 'memberships'> };

interface HandleMembershipInvitationOpts {
  /**
   * The caller proved possession of the invitation's emailed token. Only then may an invitation not yet bound to a
   * user be answered; by id alone an invitation stays answerable by its bound user only (GHSA-fmh4-wcc4-5jm3).
   */
  viaToken?: boolean;
}

/**
 * Answers an invitation for the signed-in user. Accepting makes them a member of its channel, or spends it when they
 * are one already; declining stamps it declined. Either way its links go, and the answer is its organization as `ChannelBase`.
 * @throws AppError 404 `not_found` for a missing, declined or another user's invitation alike, 409 `user_mismatch` when
 * a token accept loses the bind to another account, 403 `channel_archived` for an accept into an archived channel, 403
 * `anonymous_account` for an accept by an account without a proven address, which binds nothing lasting to itself.
 */
export async function handleMembershipInvitationOp(
  ctx: InvitationAnswerContext,
  inactiveMembershipId: string,
  acceptOrDecline: 'accept' | 'decline',
  { viaToken = false }: HandleMembershipInvitationOpts = {},
) {
  const userId = ctx.var.user.id;
  if (acceptOrDecline === 'accept' && !(await isProvenAccount(ctx, { userId }))) {
    throw new AppError(403, 'anonymous_account', 'warn', { meta: { resource: 'invitation' } });
  }

  const inactiveMembership = viaToken
    ? await findClaimableInactiveMembership(ctx, { id: inactiveMembershipId, userId })
    : await findInactiveMembershipForUser(ctx, { id: inactiveMembershipId, userId });

  if (!inactiveMembership) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation', id: inactiveMembershipId } });

  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    if (acceptOrDecline === 'accept') {
      if (viaToken) {
        // Bind before activating: of two accounts racing for the same unbound invitation, exactly one wins.
        const [bound] = await bindInactiveMemberships(txCtx, { ids: [inactiveMembership.id], userId });
        if (!bound) throw new AppError(409, 'user_mismatch', 'warn', { meta: { id: inactiveMembership.id } });
      }

      const entity = await resolveEntity(txCtx, { entityType: inactiveMembership.channelType, identifier: inactiveMembership.channelId });
      if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: inactiveMembership.channelType });
      // Joining is a create inside the channel, which an archive refuses; the invitation waits for the unarchive.
      if (entity.archived) throw new AppError(403, 'channel_archived', 'warn', { entityType: inactiveMembership.channelType });

      // Invited on another address while already a member: the invitation is spent, the membership stays as it is.
      const alreadyMember = ctx.var.memberships.some((m) => m.channelId === inactiveMembership.channelId);

      const activatedMemberships = alreadyMember
        ? []
        : await insertMemberships(txCtx, { items: [{ entity, userId, role: inactiveMembership.role, createdBy: inactiveMembership.createdBy }] });

      // The emailed links go with the row: they have no further use once the invitation is answered.
      await deleteInactiveMembership(txCtx, { id: inactiveMembership.id });

      log.info('Membership accepted', { ids: activatedMemberships.map((m) => m.id), viaToken, alreadyMember });
    }

    if (acceptOrDecline === 'decline') {
      await stampInactiveMembershipDeclined(txCtx, { id: inactiveMembership.id });
      await deleteInvitationTokens(txCtx, { inactiveMembershipIds: [inactiveMembership.id] });
    }
  });
  if (acceptOrDecline === 'accept') invalidateCache.user(userId);

  const organization = await resolveEntity(ctx, { entityType: 'organization', identifier: inactiveMembership.organizationId });
  if (!organization) throw new AppError(404, 'not_found', 'error', { entityType: 'organization' });

  // The invitee may have declined and is no member: the answer names the organization, never its settings or writers.
  return pick(organization, channelBaseSchema.keyof().options);
}
