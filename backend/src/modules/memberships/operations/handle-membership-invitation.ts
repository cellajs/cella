import { and, eq } from 'drizzle-orm';
import { hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { findInactiveMembershipForUser } from '#/modules/memberships/memberships-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const rootContextType = hierarchy.contextTypes.find((t) => hierarchy.getParent(t) === null)!;

export async function handleMembershipInvitationOp(
  ctx: AuthContext,
  inactiveMembershipId: string,
  acceptOrReject: 'accept' | 'reject',
) {
  const inactiveMembership = await findInactiveMembershipForUser(ctx, { id: inactiveMembershipId });

  if (!inactiveMembership)
    throw new AppError(404, 'inactive_membership_not_found', 'error', { meta: { id: inactiveMembershipId } });

  const entityFieldId = inactiveMembership.contextId;

  await baseDb.transaction(async (tx) => {
    if (acceptOrReject === 'accept') {
      const entity = await resolveEntity({ var: { db: tx } }, inactiveMembership.contextType, entityFieldId);
      if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: inactiveMembership.contextType });

      const activatedMemberships = await insertMemberships(
        { var: { db: tx } },
        {
          items: [
            { entity, userId: ctx.var.user.id, role: inactiveMembership.role, createdBy: inactiveMembership.createdBy },
          ],
        },
      );

      await tx.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

      log.info('Membership accepted', { ids: activatedMemberships.map((m) => m.id) });
    }

    if (acceptOrReject === 'reject') {
      await tx
        .update(inactiveMembershipsTable)
        .set({ rejectedAt: getIsoDate() })
        .where(and(eq(inactiveMembershipsTable.id, inactiveMembership.id)));
    }
  });

  const rootEntityId = inactiveMembership.organizationId;
  if (!rootEntityId) throw new AppError(500, 'server_error', 'error', { entityType: rootContextType });

  const entity = await resolveEntity({ var: { db: baseDb } }, rootContextType, rootEntityId);
  if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: rootContextType });

  return entity;
}
