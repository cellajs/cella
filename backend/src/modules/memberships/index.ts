import { type SQL, and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { deleteMembershipsRouteConfig, updateMembershipRouteConfig } from './routes';
import permissionManager from '../../lib/permission-manager';
import { extractEntity } from '../../lib/extract-entity';

const app = new CustomHono();

// * Membership endpoints
const membershipRoutes = app
  /*
   * Update user membership
   */
  .openapi(updateMembershipRouteConfig, async (ctx) => {
    const { membership: membershipId } = ctx.req.valid('param');
    const { role, inactive, muted } = ctx.req.valid('json');
    const user = ctx.get('user');

    // * Get the membership
    const [currentMembership] = await db.select().from(membershipsTable).where(eq(membershipsTable.id, membershipId));
    if (!currentMembership) return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { membership: membershipId });

    const type = currentMembership.type;

    // TODO: Refactor
    const context = await extractEntity(type, currentMembership.projectId || currentMembership.workspaceId || currentMembership.organizationId || '');

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    // * Check if user has permission to someone elses membership
    if (user.id !== currentMembership.userId) {
      const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', context);

      if (!isAllowed && user.role !== 'ADMIN') {
        return errorResponse(ctx, 403, 'forbidden', 'warn', type, { user: user.id, id: context.id });
      }
    }

    const [membership] = await db
      .update(membershipsTable)
      .set(
        role
          ? { role, inactive, muted, modifiedBy: user.id, modifiedAt: new Date() }
          : { inactive, muted, modifiedBy: user.id, modifiedAt: new Date() },
      )
      .where(and(eq(membershipsTable.id, membershipId)))
      .returning();

    const sseEvent = type === 'ORGANIZATION' ? 'update_organization' : 'update_workspace';
    const sseData = {
      ...context,
      muted,
      archived: inactive,
      userRole: role,
      type: type,
    };

    sendSSE(membership.userId, sseEvent, sseData);

    logEvent('Membership updated', { user: membership.userId, membership: membership.id });

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
    const { idOrSlug, entityType, ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    // * Convert the member ids to an array
    const memberIds = Array.isArray(ids) ? ids : [ids];

    // Check if the user has permission to delete the memberships
    const context = await extractEntity(entityType, idOrSlug);
    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', context);

    if (!isAllowed && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', entityType, { user: user.id, id: context.id });
    }

    const errors: ErrorType[] = [];

    let where: SQL;
    if (entityType === 'ORGANIZATION') {
      where = eq(membershipsTable.organizationId, context.id);
    } else if (entityType === 'WORKSPACE') {
      where = eq(membershipsTable.workspaceId, context.id);
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
          createError(ctx, 404, 'not_found', 'warn', entityType, {
            user: id,
          }),
        );
      }
    }

    // * Filter out memberships that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      if (user.role !== 'ADMIN' && currentUserMembership?.role !== 'ADMIN') {
        errors.push(
          createError(ctx, 403, 'delete_forbidden', 'warn', entityType, {
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

      if (entityType === 'ORGANIZATION') {
        sendSSE(membership.userId, 'remove_organization_membership', {
          id: context.id,
          userId: membership.userId,
        });
      } else {
        sendSSE(membership.userId, 'remove_workspace_membership', {
          id: context.id,
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
