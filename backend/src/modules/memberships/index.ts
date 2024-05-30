import { type SQL, and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { deleteMembershipsRouteConfig, inviteMembershipRouteConfig, updateMembershipRouteConfig } from './routes';
import permissionManager from '../../lib/permission-manager';
import { extractEntity } from '../../lib/extract-entity';
import type { OrganizationModel } from '../../db/schema/organizations';
import { checkRole } from '../general/helpers/check-role';
import { apiMembershipSchema } from './schema';
import { usersTable } from '../../db/schema/users';
import { generateId, type User } from 'lucia';
import { type TokenModel, tokensTable } from '../../db/schema/tokens';
import { createDate, TimeSpan } from 'oslo';
import { config } from 'config';
import { i18n } from '../../lib/i18n';
import { render } from '@react-email/render';
import { InviteEmail } from '../../../../email/emails/invite';
import { emailSender } from 'email';
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

    const sseEvent = `update_${type.toLowerCase()}`;
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
   * Invite members to an organization
   */
  .openapi(inviteMembershipRouteConfig, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('query');
    const { emails, role } = ctx.req.valid('json');
    const user = ctx.get('user');

    // Refactor
    const organization = idOrSlug ? ((await extractEntity('ORGANIZATION', idOrSlug)) as OrganizationModel) : null;

    if (!organization) return errorResponse(ctx, 403, 'forbidden', 'warn');

    // Check to invite on organization level
    if (organization && !checkRole(apiMembershipSchema, role)) {
      return errorResponse(ctx, 400, 'invalid_role', 'warn');
    }

    for (const email of emails) {
      const [targetUser] = (await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()))) as (User | undefined)[];

      // Check if it's invitation to organization
      if (targetUser && organization) {
        // Check if user is already member of organization
        const [existingMembership] = await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)));
        if (existingMembership) {
          logEvent('User already member of organization', { user: targetUser.id, organization: organization.id });

          // Update role if different
          if (role && existingMembership.role !== role && existingMembership.organizationId && existingMembership.userId) {
            await db
              .update(membershipsTable)
              .set({ role: role as MembershipModel['role'] })
              .where(
                and(eq(membershipsTable.organizationId, existingMembership.organizationId), eq(membershipsTable.userId, existingMembership.userId)),
              );
            logEvent('User role updated', { user: targetUser.id, organization: organization.id, role });

            sendSSE(targetUser.id, 'update_organization', {
              ...organization,
              userRole: role,
              type: 'ORGANIZATION',
            });
          }

          continue;
        }

        // Check if user is trying to invite themselves
        if (user.id === targetUser.id) {
          await db
            .insert(membershipsTable)
            .values({
              organizationId: organization.id,
              userId: user.id,
              role: (role as MembershipModel['role']) || 'MEMBER',
              createdBy: user.id,
            })
            .returning();

          logEvent('User added to organization', { user: user.id, organization: organization.id });

          sendSSE(user.id, 'new_organization_membership', {
            ...organization,
            userRole: role || 'MEMBER',
            type: 'ORGANIZATION',
          });

          continue;
        }
      }

      const token = generateId(40);
      await db.insert(tokensTable).values({
        id: token,
        type: 'ORGANIZATION_INVITATION',
        userId: targetUser?.id,
        email: email.toLowerCase(),
        role: (role as TokenModel['role']) || 'USER',
        organizationId: organization?.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailLanguage = organization?.defaultLanguage || targetUser?.language || config.defaultLanguage;

      const emailHtml = render(
        InviteEmail({
          i18n: i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage }),
          orgName: organization.name || '',
          orgImage: organization.logoUrl || '',
          userImage: targetUser?.thumbnailUrl ? `${targetUser.thumbnailUrl}?width=100&format=avif` : '',
          username: targetUser?.name || email.toLowerCase() || '',
          invitedBy: user.name,
          inviteUrl: `${config.frontendUrl}/auth/accept-invite/${token}`,
          replyTo: user.email,
        }),
      );
      logEvent('User invited to organization', { organization: organization?.id });

      emailSender
        .send(
          config.senderIsReceiver ? user.email : email.toLowerCase(),
          organization ? `Invitation to ${organization.name} on Cella` : 'Invitation to Cella',
          emailHtml,
          user.email,
        )
        .catch((error) => {
          logEvent('Error sending email', { error: (error as Error).message }, 'error');
        });
    }

    return ctx.json(
      {
        success: true,
        data: undefined,
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
