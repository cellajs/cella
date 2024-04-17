import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { usersTable } from '../../db/schema/users';

import { errorResponse } from '../../lib/errors';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { transformDatabaseUser } from '../users/helpers/transform-database-user';
import { deleteMembershipRouteConfig, updateMembershipRouteConfig } from './routes';

const app = new CustomHono();

// * Membership endpoints
const membershipRoutes = app
  /*
   * Delete users from organization
   */
  .openapi(deleteMembershipRouteConfig, async (ctx) => {
    const { ids, organizationIdentifier } = ctx.req.valid('query');
    const usersIds = Array.isArray(ids) ? ids : [ids];

    await Promise.all(
      usersIds.map(async (id) => {
        const [targetMembership] = await db
          .delete(membershipsTable)
          .where(and(eq(membershipsTable.userId, id), eq(membershipsTable.organizationId, organizationIdentifier)))
          .returning();
        if (!targetMembership) {
          return errorResponse(ctx, 404, 'not_found', 'warn', 'membership', {
            user: id,
            organization: organizationIdentifier,
          });
        }

        logEvent('Member deleted', { user: id, organization: organizationIdentifier });

        sendSSE(id, 'remove_organization_membership', { id: organizationIdentifier });
      }),
    );

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  /*
   * Update user membership
   */
  .openapi(updateMembershipRouteConfig, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const { role, inactive, muted } = ctx.req.valid('json');
    const user = ctx.get('user');

    const organization = ctx.get('organization');

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, id));

    if (!targetUser) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { user: id });

    let [membership] = await db
      .update(membershipsTable)
      .set(
        role
          ? { role, inactive, muted, modifiedBy: user.id, modifiedAt: new Date() }
          : { inactive, muted, modifiedBy: user.id, modifiedAt: new Date() },
      )
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)))
      .returning();

    if (!membership) {
      if (targetUser.id === user.id) {
        [membership] = await db
          .insert(membershipsTable)
          .values({
            userId: user.id,
            organizationId: organization.id,
            role,
          })
          .returning();

        sendSSE(targetUser.id, 'new_organization_membership', {
          ...organization,
          userRole: role,
        });
      } else {
        return errorResponse(ctx, 404, 'not_found', 'warn', 'membership', {
          user: targetUser.id,
          organization: organization.id,
        });
      }
    }

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.organizationId, organization.id));

    logEvent('User updated in organization', {
      user: targetUser.id,
      organization: organization.id,
    });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(targetUser),
        sessions: [],
        organizationRole: membership.role,
        counts: {
          memberships,
        },
      },
    });
  });

export default membershipRoutes;

export type MembershipRoutes = typeof membershipRoutes;
