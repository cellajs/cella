import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { type MembershipModel, membershipsTable } from '#/db/schema/memberships';

import { config } from 'config';
import { render } from 'jsx-email';
import { generateId } from 'lucia';
import { TimeSpan, createDate } from 'oslo';
import { emailSender } from '#/lib/mailer';
import { InviteMemberEmail } from '../../../emails/member-invite';

import type { OrganizationModel } from '#/db/schema/organizations';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { getUsersByConditions } from '#/db/util';
import { getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import permissionManager from '#/lib/permission-manager';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { insertMembership } from './helpers/insert-membership';
import membershipRouteConfig from './routes';

const app = new CustomHono();

// Membership endpoints
const membershipsRoutes = app
  /*
   * Invite members to an entity such as an organization
   */
  .openapi(membershipRouteConfig.createMembership, async (ctx) => {
    const { idOrSlug, entityType, organizationId } = ctx.req.valid('query');
    const { emails, role } = ctx.req.valid('json');
    const user = getContextUser();

    // Check params
    if (!organizationId || !entityType || !config.contextEntityTypes.includes(entityType) || !idOrSlug) {
      return errorResponse(ctx, 403, 'forbidden', 'warn');
    }

    // Fetch organization, user memberships, and context from the database
    const [organization, memberships, context] = await Promise.all([
      resolveEntity('organization', organizationId) as Promise<OrganizationModel>,
      db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id)),
      resolveEntity(entityType, idOrSlug),
    ]);

    // Check if the user is allowed to perform an update action in the organization
    const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', organization);

    if (!context || !organization || (!isAllowed && user.role !== 'admin')) {
      return errorResponse(ctx, 403, 'forbidden', 'warn');
    }

    // Normalize emails for consistent comparison
    const normalizedEmails = emails.map((email) => email.toLowerCase());

    // Fetch existing users from the database
    const existingUsers = await getUsersByConditions([inArray(usersTable.email, normalizedEmails)]);

    // Maps to store memberships by existing user
    const organizationMembershipsByUser = new Map<string, MembershipModel>();
    const contextMembershipsByUser = new Map<string, MembershipModel>();

    if (existingUsers.length) {
      // Prepare conditions for fetching existing memberships
      const $where = [
        and(
          eq(membershipsTable[`${context.entity}Id`], context.id),
          eq(membershipsTable.type, context.entity as MembershipModel['type']),
          inArray(
            membershipsTable.userId,
            existingUsers.map((u) => u.id),
          ),
        ),
      ];

      // Add conditions for organization memberships if applicable
      if (context.entity !== 'organization') {
        $where.push(
          and(
            eq(membershipsTable.organizationId, organizationId),
            eq(membershipsTable.type, 'organization'),
            inArray(
              membershipsTable.userId,
              existingUsers.map((u) => u.id),
            ),
          ),
        );
      }

      // Query existing memberships
      const existingMemberships = await db
        .select()
        .from(membershipsTable)
        .where($where.length > 1 ? or(...$where) : $where[0]);

      // Group memberships by user
      for (const membership of existingMemberships) {
        if (membership.userId && membership.type === 'organization') organizationMembershipsByUser.set(membership.userId, membership);
        if (membership.userId && membership.type === context.entity) contextMembershipsByUser.set(membership.userId, membership);
      }
    }

    // Map to track existing users
    const existingUsersByEmail = new Map<string, UserModel>();

    // Array of emails to send invitations
    const emailsToSendInvitation: string[] = [];

    // Establish memberships for existing users
    await Promise.all(
      existingUsers.map(async (existingUser) => {
        existingUsersByEmail.set(existingUser.email, existingUser);

        const existingMembership = contextMembershipsByUser.get(existingUser.id);
        const organizationMembership = organizationMembershipsByUser.get(existingUser.id);

        if (existingMembership) {
          logEvent(`User already member of ${context.entity}`, { user: existingUser.id, id: context.id });

          // Check if the role needs to be updated (downgrade or upgrade)
          if (role && existingMembership.role !== role) {
            await db
              .update(membershipsTable)
              .set({ role: role as MembershipModel['role'] })
              .where(eq(membershipsTable.id, existingMembership.id));

            logEvent('User role updated', { user: existingUser.id, id: context.id, type: existingMembership.type, role });
          }
        } else {
          // Check if membership creation is allowed and if invitation is needed
          const canCreateMembership = context.entity !== 'organization' || existingUser.id === user.id;
          const needsInvitation =
            (context.entity !== 'organization' && !organizationMembership) || (context.entity === 'organization' && existingUser.id !== user.id);

          if (canCreateMembership) {
            const assignedRole = (role as MembershipModel['role']) || 'member';

            // Insert membership
            const createdMembership = await insertMembership({ user: existingUser, role: assignedRole, entity: context });

            // Send a Server-Sent Event (SSE) to the newly added user
            sendSSEToUsers([existingUser.id], 'update_entity', {
              ...context,
              membership: createdMembership,
            });
          }

          if (needsInvitation) {
            // Add email to the invitation list for sending an organization invite to another user
            emailsToSendInvitation.push(existingUser.email);
          }
        }
      }),
    );

    // Identify emails that do not have existing users (will need to send a invitation)
    for (const email of normalizedEmails) {
      if (!existingUsersByEmail.has(email)) emailsToSendInvitation.push(email);
    }

    // Send invitations for organization membership
    await Promise.all(
      emailsToSendInvitation.map(async (email) => {
        const targetUser = existingUsersByEmail.get(email);

        const token = generateId(40);
        await db.insert(tokensTable).values({
          id: token,
          type: 'membership_invitation',
          userId: targetUser?.id,
          email: email,
          role: (role as TokenModel['role']) || 'member',
          organizationId: organization.id,
          expiresAt: createDate(new TimeSpan(7, 'd')),
        });

        // Render email template
        const emailHtml = await render(
          InviteMemberEmail({
            userName: targetUser?.name,
            userLanguage: targetUser?.language || user.language,
            userThumbnailUrl: targetUser?.thumbnailUrl,
            inviteBy: user.name,
            inviterEmail: user.email,
            organizationName: organization.name,
            organizationThumbnailUrl: organization.logoUrl || organization.thumbnailUrl,
            token,
          }),
        );

        // Log event for user invitation
        logEvent('User invited to organization', { organization: organization.id });

        // Send invitation email
        emailSender
          .send(config.senderIsReceiver ? user.email : email, `Invitation to ${organization.name} on Cella`, emailHtml, user.email)
          .catch((error) => {
            logEvent('Error sending email', { error: (error as Error).message }, 'error');
          });
      }),
    );

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete memberships to remove users from entity
   */
  .openapi(membershipRouteConfig.deleteMemberships, async (ctx) => {
    const { idOrSlug, entityType, ids } = ctx.req.valid('query');
    const user = getContextUser();

    if (!config.contextEntityTypes.includes(entityType)) return errorResponse(ctx, 404, 'not_found', 'warn');
    // Convert the member ids to an array
    const memberToDeleteIds = Array.isArray(ids) ? ids : [ids];

    // Check if the user has permission to delete the memberships
    const membershipContext = await resolveEntity(entityType, idOrSlug);
    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

    const isAllowed = permissionManager.isPermissionAllowed(memberships, 'update', membershipContext);

    if (!isAllowed && user.role !== 'admin') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', entityType, { user: user.id, id: membershipContext.id });
    }

    const errors: ErrorType[] = [];

    const filters = and(eq(membershipsTable.type, entityType), or(eq(membershipsTable[`${entityType}Id`], membershipContext.id)));

    // Get the user membership
    const [currentUserMembership] = (await db
      .select()
      .from(membershipsTable)
      .where(and(filters, eq(membershipsTable.userId, user.id)))) as (MembershipModel | undefined)[];

    // Get the memberships
    const targets = await db
      .select()
      .from(membershipsTable)
      .where(and(inArray(membershipsTable.userId, memberToDeleteIds), filters));

    // Check if the memberships exist
    for (const id of memberToDeleteIds) {
      if (!targets.some((target) => target.userId === id)) {
        errors.push(createError(ctx, 404, 'not_found', 'warn', entityType, { user: id }));
      }
    }

    // Filter out memberships that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      if (user.role !== 'admin' && currentUserMembership?.role !== 'admin') {
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

    // If the user doesn't have permission to delete any of the memberships, return an error
    if (allowedTargets.length === 0) {
      return ctx.json({ success: false, errors: errors }, 200);
    }

    // Delete the memberships
    await db.delete(membershipsTable).where(
      inArray(
        membershipsTable.id,
        allowedTargets.map((target) => target.id),
      ),
    );

    // Send SSE events for the memberships that were deleted
    for (const membership of allowedTargets) {
      // Send the event to the user if they are a member of the organization
      const memberIds = targets.map((el) => el.userId).filter(Boolean) as string[];
      sendSSEToUsers(memberIds, 'remove_entity', { id: membershipContext.id, entity: membershipContext.entity });

      logEvent('Member deleted', { membership: membership.id });
    }

    return ctx.json({ success: true, errors }, 200);
  })
  /*
   * Update user membership
   */
  .openapi(membershipRouteConfig.updateMembership, async (ctx) => {
    const { id: membershipId } = ctx.req.valid('param');
    const { role, archived, muted, order } = ctx.req.valid('json');
    const user = getContextUser();

    let orderToUpdate = order;
    // Get the membership
    const [membershipToUpdate] = await db.select().from(membershipsTable).where(eq(membershipsTable.id, membershipId));
    if (!membershipToUpdate) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { membership: membershipId });

    const updatedType = membershipToUpdate.type;

    // on restore item set last order in memberships
    if (archived === false) {
      const [lastOrderMembership] = await db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.type, updatedType), eq(membershipsTable.userId, user.id)))
        .orderBy(desc(membershipsTable.order))
        .limit(1);
      const ceilOrder = Math.ceil(lastOrderMembership.order);
      orderToUpdate = lastOrderMembership.order === ceilOrder ? ceilOrder + 1 : ceilOrder;
    }

    const membershipContext = await resolveEntity(updatedType, membershipToUpdate[`${updatedType}Id`]);

    // Check if user has permission to someone elses membership
    if (user.id !== membershipToUpdate.userId) {
      const permissionMemberships = await db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.type, updatedType), eq(membershipsTable.userId, user.id)));
      const isAllowed = permissionManager.isPermissionAllowed(permissionMemberships, 'update', membershipContext);
      if (!isAllowed && user.role !== 'admin') {
        return errorResponse(ctx, 403, 'forbidden', 'warn', updatedType, { user: user.id, id: membershipContext.id });
      }
    }

    const [updatedMembership] = await db
      .update(membershipsTable)
      .set({
        role,
        ...(orderToUpdate !== undefined && { order: orderToUpdate }),
        ...(muted !== undefined && { muted }),
        ...(archived !== undefined && { archived }),
        modifiedBy: user.id,
        modifiedAt: new Date(),
      })
      .where(and(eq(membershipsTable.id, membershipId)))
      .returning();

    sendSSEToUsers([membershipToUpdate.userId], 'update_entity', {
      ...membershipContext,
      membership: updatedMembership,
    });

    logEvent('Membership updated', { user: updatedMembership.userId, membership: updatedMembership.id });

    return ctx.json(
      {
        success: true,
        data: updatedMembership,
      },
      200,
    );
  });

export type AppMembershipsType = typeof membershipsRoutes;

export default membershipsRoutes;
