import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable, type MembershipModel } from '../../db/schema/memberships';

import { render } from '@react-email/render';
import { config } from 'config';
import { emailSender } from 'email';
import { generateId, type User } from 'lucia';
import { TimeSpan, createDate } from 'oslo';
import { InviteEmail } from '../../../../email/emails/invite';
import { tokensTable, type TokenModel } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { resolveEntity } from '../../lib/entity';
import { createError, errorResponse, type ErrorType } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import permissionManager from '../../lib/permission-manager';
import { sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { createMembershipRouteConfig, deleteMembershipsRouteConfig, updateMembershipRouteConfig } from './routes';
import type { OrganizationModel } from '../../db/schema/organizations';
import type { ProjectModel } from '../../db/schema/projects';

const app = new CustomHono();

// * Membership endpoints
const membershipsRoutes = app
  /*
   * Invite members to an entity such as an organization
   */
  .openapi(createMembershipRouteConfig, async (ctx) => {
    const { idOrSlug, entityType, organizationId } = ctx.req.valid('query');
    const { emails, role } = ctx.req.valid('json');

    const user = ctx.get('user');

    // Resolve organization
    const organization = await resolveEntity('ORGANIZATION', organizationId) as OrganizationModel;

    // Fetch user's memberships from the database
    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id));

    // Check if the user is allowed to perform an update action in the organization
    const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', organization);

    if (!organizationId || !organization || !idOrSlug || (!isAllowed && user.role !== 'ADMIN')) {
      return errorResponse(ctx, 403, 'forbidden', 'warn');
    }

    // Resolve context (currently supports only projects and organizations)
    const context = idOrSlug ? await resolveEntity(entityType, idOrSlug) as OrganizationModel | ProjectModel : null;

    if (!context || !['PROJECT', 'ORGANIZATION'].includes(context?.entity)) {
      return errorResponse(ctx, 403, 'forbidden', 'warn');
    }

    // Normalize emails for consistent comparison
    const normalizedEmails = emails.map(email => email.toLowerCase());

    // Fetch existing users from the database
    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.email, normalizedEmails));

    // Identify emails that do not have existing users
    const nonExistingEmails = normalizedEmails.filter(email => 
      !existingUsers.some(existingUser => existingUser.email === email)
    );

    // Establish memberships for existing users
    for (const existingUser of existingUsers) {
      // Fetch the existing membership for the user in the given context
      const [existingMembership] = await db
        .select()
        .from(membershipsTable)
        .where(and(
          eq((context.entity === 'PROJECT' ? membershipsTable.projectId : membershipsTable.organizationId), context.id),
          eq(membershipsTable.type, context.entity as MembershipModel['type']),
          eq(membershipsTable.userId, existingUser.id)
        ));

      // If membership already exists, check if the role needs to be updated (downgrade or upgrade)
      if (existingMembership) {
        logEvent(`User already member of ${context.entity.toLowerCase()}`, { user: existingUser.id, id: context.id });

        if (role && existingMembership.role !== role) {
          await db
            .update(membershipsTable)
            .set({ role: role as MembershipModel['role'] })
            .where(eq(membershipsTable.id, existingMembership.id));
        
            logEvent('User role updated', { user: existingUser.id, id: context.id, type: existingMembership.type, role });
        }
      }

      // If membership doesn't exist, create one
      if (!existingMembership) {
        // Define the role to be assigned, defaulting to 'MEMBER' if not specified
        const assignedRole = (role as MembershipModel['role']) || 'MEMBER';

        // Insert new membership into the database
        await db
          .insert(membershipsTable)
          .values({
            organizationId,
            userId: existingUser.id,
            type: context.entity as MembershipModel['type'],
            role: assignedRole,
            createdBy: user.id,
          })
          .returning();

        // Log the event of the user being added to the context
        logEvent(`User added to ${context.entity.toLowerCase()}`, { user: user.id, id: context.id });

        // Send a Server-Sent Event (SSE) to the newly added user
        sendSSEToUsers([existingUser.id], 'update_entity', context);
      }
    }

    // Create new users for non-existing emails
    for (const email of nonExistingEmails) {
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
              type: 'ORGANIZATION',
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
          inviteUrl: `${config.frontendUrl}/auth/invite/${token}`,
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

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete memberships to remove users from entity
   */
  .openapi(deleteMembershipsRouteConfig, async (ctx) => {
    const { idOrSlug, entityType, ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    if (!config.contextEntityTypes.includes(entityType)) return errorResponse(ctx, 404, 'not_found', 'warn');
    // * Convert the member ids to an array
    const memberToDeleteIds = Array.isArray(ids) ? ids : [ids];

    // Check if the user has permission to delete the memberships
    const membershipContext = await resolveEntity(entityType, idOrSlug);
    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', membershipContext);

    if (!isAllowed && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', entityType, { user: user.id, id: membershipContext.id });
    }

    const errors: ErrorType[] = [];

    const where = and(
      eq(membershipsTable.type, entityType),
      or(
        eq(membershipsTable.organizationId, membershipContext.id),
        eq(membershipsTable.workspaceId, membershipContext.id),
        eq(membershipsTable.projectId, membershipContext.id),
      ),
    );

    // * Get the user membership
    const [currentUserMembership] = (await db
      .select()
      .from(membershipsTable)
      .where(and(where, eq(membershipsTable.userId, user.id)))) as (MembershipModel | undefined)[];

    // * Get the memberships
    const targets = await db
      .select()
      .from(membershipsTable)
      .where(and(inArray(membershipsTable.userId, memberToDeleteIds), where));

    // * Check if the memberships exist
    for (const id of memberToDeleteIds) {
      if (!targets.some((target) => target.userId === id)) {
        errors.push(createError(ctx, 404, 'not_found', 'warn', entityType, { user: id }));
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
      return ctx.json({ success: false, errors: errors }, 200);
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
      const memberIds = targets.map((el) => el.userId).filter(Boolean) as string[];
      sendSSEToUsers(memberIds, 'remove_entity', { ...membershipContext, ...membership });

      logEvent('Member deleted', { membership: membership.id });
    }

    return ctx.json({ success: true, errors }, 200);
  })
  /*
   * Update user membership
   */
  .openapi(updateMembershipRouteConfig, async (ctx) => {
    const { id: membershipId } = ctx.req.valid('param');
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

    // * Check if user has permission to someone elses membership
    if (user.id !== membershipToUpdate.userId) {
      const permissionMemberships = await db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.type, updatedType), eq(membershipsTable.userId, user.id)));
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

    const allMembers = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.type, updatedType),
          or(
            eq(membershipsTable.organizationId, membershipContext.id),
            eq(membershipsTable.workspaceId, membershipContext.id),
            eq(membershipsTable.projectId, membershipContext.id),
          ),
        ),
      );

    const membersIds = allMembers.map((member) => member.id).filter(Boolean) as string[];

    sendSSEToUsers(membersIds, 'update_entity', {
      ...updatedMembership,
      ...membershipContext,
    });

    logEvent('Membership updated', { user: updatedMembership.userId, membership: updatedMembership.id });

    return ctx.json({ success: true, data: updatedMembership }, 200);
  });

export default membershipsRoutes;
