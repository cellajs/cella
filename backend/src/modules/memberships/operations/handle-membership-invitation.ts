import { and, eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deleteInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import {
  bindInactiveMemberships,
  findClaimableInactiveMembership,
  findInactiveMembershipForUser,
} from '#/modules/memberships/memberships-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

interface HandleMembershipInvitationOpts {
  /**
   * The caller proved possession of the invitation's emailed token. Only then may an invitation not yet bound to a
   * user be answered; by id alone an invitation stays answerable by its bound user only (GHSA-fmh4-wcc4-5jm3).
   */
  viaToken?: boolean;
}

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

  if (!inactiveMembership)
    throw new AppError(404, 'inactive_membership_not_found', 'error', { meta: { id: inactiveMembershipId } });

  await baseDb.transaction(async (tx) => {
    if (acceptOrReject === 'accept') {
      if (viaToken) {
        // Bind before activating: of two accounts racing for the same unbound invitation, exactly one wins.
        const [bound] = await bindInactiveMemberships({ var: { db: tx } }, { ids: [inactiveMembership.id], userId });
        if (!bound) throw new AppError(409, 'user_mismatch', 'warn', { meta: { id: inactiveMembership.id } });
      }

      const entity = await resolveEntity(
        { var: { db: tx } },
        { entityType: inactiveMembership.channelType, identifier: inactiveMembership.channelId },
      );
      if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: inactiveMembership.channelType });

      // Invited on another address while already a member: the invitation is spent, the membership stays as it is.
      const alreadyMember = ctx.var.memberships.some((m) => m.channelId === inactiveMembership.channelId);

      const activatedMemberships = alreadyMember
        ? []
        : await insertMemberships(
            { var: { db: tx } },
            { items: [{ entity, userId, role: inactiveMembership.role, createdBy: inactiveMembership.createdBy }] },
          );

      await tx.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
      // The emailed link has no further use once the invitation is answered.
      await deleteInvitationTokens({ var: { db: tx } }, { inactiveMembershipIds: [inactiveMembership.id] });

      log.info('Membership accepted', { ids: activatedMemberships.map((m) => m.id), viaToken, alreadyMember });
    }

    if (acceptOrReject === 'reject') {
      await tx
        .update(inactiveMembershipsTable)
        .set({ rejectedAt: getIsoDate() })
        .where(and(eq(inactiveMembershipsTable.id, inactiveMembership.id)));
      await deleteInvitationTokens({ var: { db: tx } }, { inactiveMembershipIds: [inactiveMembership.id] });
    }
  });

  const organizationId = inactiveMembership.organizationId;
  if (!organizationId) throw new AppError(500, 'server_error', 'error', { entityType: 'organization' });

  const entity = await resolveEntity(
    { var: { db: baseDb } },
    { entityType: 'organization', identifier: organizationId },
  );
  if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: 'organization' });

  return entity;
}
