import { type SQL, and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { deleteMembershipsRouteConfig, inviteMembershipRouteConfig, updateMembershipRouteConfig } from './routes';
import permissionManager from '../../lib/permission-manager';
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
import { resolveEntity } from '../../lib/entity';

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
    const [membershipToUpdate] = await db.select().from(membershipsTable).where(eq(membershipsTable.id, membershipId));
    if (!membershipToUpdate) return errorResponse(ctx, 404, 'not_found', 'warn', 'USER', { membership: membershipId });

    const updatedType = membershipToUpdate.type;

    // TODO: Refactor
    const membershipContext = await resolveEntity(
      updatedType,
      membershipToUpdate.projectId || membershipToUpdate.workspaceId || membershipToUpdate.organizationId || '',
    );
    const permissionMemberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, updatedType), eq(membershipsTable.userId, user.id)));

    // * Check if user has permission to someone elses membership
    if (user.id !== membershipToUpdate.userId) {
      const isAllowed = permissionManager.isPermissionAllowed(permissionMemberships, 'update', membershipContext);
      if (!isAllowed && user.role !== 'ADMIN') {
        return errorResponse(ctx, 403, 'forbidden', 'warn', updatedType, { user: user.id, id: membershipContext.id });
      }
    }

    const [updatedMembership] = await db
      .update(membershipsTable)
      .set({ ...(role && { role }), inactive, muted, modifiedBy: user.id, modifiedAt: new Date() })
      .where(and(eq(membershipsTable.id, membershipId)))
      .returning();

    let allMembershipsFilter: SQL<unknown> | undefined;
    if (updatedType === 'ORGANIZATION') allMembershipsFilter = eq(membershipsTable.organizationId, membershipContext.id);
    if (updatedType === 'WORKSPACE') allMembershipsFilter = eq(membershipsTable.workspaceId, membershipContext.id);
    if (updatedType === 'PROJECT') allMembershipsFilter = eq(membershipsTable.projectId, membershipContext.id);

    const allMembers = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, updatedType), allMembershipsFilter));

    const membersIds = allMembers.map((member) => member.id).filter(Boolean) as string[];
    const sseData = {
      ...membershipContext,
      muted,
      archived: inactive,
      entity: updatedType,
    };
    if (updatedType === 'PROJECT') {
      sendSSEToUsers(membersIds, 'update_entity', sseData);
    } else {
      sendSSEToUsers(membersIds, 'update_entity', sseData);
    }

    logEvent('Membership updated', { user: updatedMembership.userId, membership: updatedMembership.id });

    return ctx.json(
      {
        success: true,
        data: updatedMembership,
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
    const organization = idOrSlug ? ((await resolveEntity('ORGANIZATION', idOrSlug)) as OrganizationModel) : null;

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

            sendSSEToUsers([targetUser.id], 'update_entity', organization);
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

          sendSSEToUsers([user.id], 'update_entity', organization);
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
    const context = await resolveEntity(entityType, idOrSlug);
    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', context);

    if (!isAllowed && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', entityType, { user: user.id, id: context.id });
    }

    const errors: ErrorType[] = [];

    let where: SQL;
    if (entityType === 'ORGANIZATION') {
      where = eq(membershipsTable.organizationId, context.id);
    }
    if (entityType === 'WORKSPACE') {
      where = eq(membershipsTable.workspaceId, context.id);
    } else {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'USER');
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

      // if (membership.type === 'WORKSPACE') {
      //   sendSSE(membership.userId, 'remove_workspace_membership', {
      //     id: context.id,
      //     userId: membership.userId,
      //   });
      // }
      // if (membership.type === 'ORGANIZATION') {
      //   sendSSE(membership.userId, 'remove_organization_membership', {
      //     id: context.id,
      //     userId: membership.userId,
      //   });
      // }

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
