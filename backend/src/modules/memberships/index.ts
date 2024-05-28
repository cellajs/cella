import { type SQL, and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { usersTable } from '../../db/schema/users';

import type { OrganizationModel } from '../../db/schema/organizations';
import type { WorkspaceModel } from '../../db/schema/workspaces';
import type { ProjectModel } from '../../db/schema/projects';
import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { deleteMembershipsRouteConfig, updateMembershipRouteConfig } from './routes';

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

    let type: 'ORGANIZATION' | 'WORKSPACE' | 'PROJECT';
    const organization = ctx.get('organization') as OrganizationModel | undefined;
    const workspace = ctx.get('workspace') as WorkspaceModel | undefined;
    const project = ctx.get('project') as ProjectModel | undefined;

    let where: SQL | undefined;
    if (organization) {
      type = 'ORGANIZATION';
      where = eq(membershipsTable.organizationId, organization.id);
    } else if (workspace) {
      type = 'WORKSPACE';
      where = eq(membershipsTable.workspaceId, workspace.id);
    } else if (project) {
      type = 'PROJECT';
      where = eq(membershipsTable.projectId, project.id);
    } else {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN');
    }

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { user: userId });

    let [membership] = await db
      .update(membershipsTable)
      .set(
        role
          ? { role, inactive, muted, modifiedBy: user.id, modifiedAt: new Date() }
          : { inactive, muted, modifiedBy: user.id, modifiedAt: new Date() },
      )
      .where(and(eq(membershipsTable.userId, userId), where))
      .returning();

    if (!membership) {
      if (targetUser.id === user.id) {
        [membership] = await db
          .insert(membershipsTable)
          .values({
            userId: user.id,
            organizationId: organization?.id || workspace?.organizationId,
            workspaceId: workspace?.id,
            role,
          })
          .returning();
      } else {
        return errorResponse(ctx, 404, 'not_found', 'warn', type, {
          user: userId,
        });
      }
    }

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

    logEvent('Membership updated', {
      user: userId,
    });

    return ctx.json(
      {
        success: true,
        data: membership,
      },
      200,
    );
  })
  /*
   * Delete users from organization
   */
  .openapi(deleteMembershipsRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    // * Convert the member ids to an array
    const memberIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    let type: 'ORGANIZATION' | 'WORKSPACE';
    const organization = ctx.get('organization') as OrganizationModel | undefined;
    const workspace = ctx.get('workspace') as WorkspaceModel | undefined;

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

    // * Get the user membership
    const [currentUserMembership] = (await db
      .select()
      .from(membershipsTable)
      .where(and(where, eq(membershipsTable.userId, user.id)))) as (MembershipModel | undefined)[];

    // * Get the memberships
    const targets = await db
      .select()
      .from(membershipsTable)
      .where(and(inArray(membershipsTable.userId, memberIds), where));

    // * Check if the memberships exist
    for (const id of memberIds) {
      if (!targets.some((target) => target.userId === id)) {
        errors.push(
          createError(ctx, 404, 'not_found', 'warn', type, {
            user: id,
          }),
        );
      }
    }

    // * Filter out memberships that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      if (user.role !== 'ADMIN' && currentUserMembership?.role !== 'ADMIN') {
        errors.push(
          createError(ctx, 403, 'delete_forbidden', 'warn', type, {
            user: target.userId,
            membership: target.id,
          }),
        );
        return false;
      }

      return true;
    });

    // * If the user doesn't have permission to delete any of the memberships, return an error
    if (allowedTargets.length === 0) {
      return ctx.json(
        {
          success: false,
          errors: errors,
        },
        200,
      );
    }

    // * Delete the memberships
    await db.delete(membershipsTable).where(
      inArray(
        membershipsTable.id,
        allowedTargets.map((target) => target.id),
      ),
    );

    // * Send SSE events for the memberships that were deleted
    for (const membership of allowedTargets) {
      // * Send the event to the user if they are a member of the organization

      if (type === 'ORGANIZATION') {
        sendSSE(membership.userId, 'remove_organization_membership', {
          id: organization?.id,
          userId: membership.userId,
        });
      } else {
        sendSSE(membership.userId, 'remove_workspace_membership', {
          id: workspace?.id,
          userId: membership.userId,
        });
      }

      logEvent('Member deleted', { membership: membership.id });
    }

    return ctx.json(
      {
        success: true,
        data: undefined,
      },
      200,
    );
  });

export default membershipRoutes;

export type MembershipRoutes = typeof membershipRoutes;
