import { type SQL, and, count, eq } from 'drizzle-orm';
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
   * Update user membership
   */
  .openapi(updateMembershipRouteConfig, async (ctx) => {
    const { user: userId } = ctx.req.valid('param');
    const { role, inactive, muted } = ctx.req.valid('json');
    const user = ctx.get('user');

    let type: 'ORGANIZATION' | 'WORKSPACE';
    const organization = ctx.get('organization');
    const workspace = ctx.get('workspace');

    let where: SQL | undefined;
    if (organization) {
      type = 'ORGANIZATION';
      where = eq(membershipsTable.organizationId, organization.id);
    } else if (workspace) {
      type = 'WORKSPACE';
      where = eq(membershipsTable.workspaceId, workspace.id);
    } else {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN');
    }

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { user: userId });

    const [membership] = await db
      .update(membershipsTable)
      .set(
        role
          ? { role, inactive, muted, modifiedBy: user.id, modifiedAt: new Date() }
          : { inactive, muted, modifiedBy: user.id, modifiedAt: new Date() },
      )
      .where(and(eq(membershipsTable.userId, userId), where))
      .returning();

    if (!membership) {
      // if (targetUser.id === user.id) {
      //   [membership] = await db
      //     .insert(membershipsTable)
      //     .values({
      //       userId: user.id,
      //       organizationId: organization.id,
      //       role,
      //     })
      //     .returning();

      //   sendSSE(targetUser.id, 'new_organization_membership', {
      //     ...organization,
      //     userRole: role,
      //     type: 'ORGANIZATION',
      //   });
      // } else {
      // }
      return errorResponse(ctx, 404, 'not_found', 'warn', type, {
        user: userId,
      });
    }

    const [{ memberships }] = await db
      .select({
        memberships: count(),
      })
      .from(membershipsTable)
      .where(where);

    logEvent('Membership updated', {
      user: userId,
    });

    if (type === 'ORGANIZATION') {
      sendSSE(membership.userId, 'update_organization', {
        ...organization,
        muted,
        archived: inactive,
        userRole: role,
        type: 'ORGANIZATION',
      });
    } else {
      sendSSE(membership.userId, 'update_workspace', {
        ...workspace,
        muted,
        archived: inactive,
        userRole: role,
        type: 'WORKSPACE',
      });
    }

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
  })
  /*
   * Delete users from organization
   */
  .openapi(deleteMembershipRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const usersIds = Array.isArray(ids) ? ids : [ids];

    let type: 'ORGANIZATION' | 'WORKSPACE';
    const organization = ctx.get('organization');
    const workspace = ctx.get('workspace');

    let where: SQL;
    if (organization) {
      type = 'ORGANIZATION';
      where = eq(membershipsTable.organizationId, organization.id);
    } else if (workspace) {
      type = 'WORKSPACE';
      where = eq(membershipsTable.workspaceId, workspace.id);
    } else {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN');
    }

    await Promise.all(
      usersIds.map(async (id) => {
        const [targetMembership] = await db.delete(membershipsTable).where(where).returning();
        if (!targetMembership) {
          return errorResponse(ctx, 404, 'not_found', 'warn', type, {
            user: id,
          });
        }

        logEvent('Member deleted', { user: id, membership: targetMembership.id });

        sendSSE(id, 'remove_organization_membership', { membership: targetMembership.id });
      }),
    );

    return ctx.json({
      success: true,
      data: undefined,
    });
  });

export default membershipRoutes;

export type MembershipRoutes = typeof membershipRoutes;
