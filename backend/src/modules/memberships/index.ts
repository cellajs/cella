import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { type MembershipModel, membershipSelect, membershipsTable } from '#/db/schema/memberships';

import { config } from 'config';
import { render } from 'jsx-email';
import { emailSender } from '#/lib/mailer';
import { MemberInviteEmail } from '../../../emails/member-invite';

import { OpenAPIHono } from '@hono/zod-openapi';
import { tokensTable } from '#/db/schema/tokens';
import { safeUserSelect, usersTable } from '#/db/schema/users';
import { getUsersByConditions } from '#/db/util';
import { entityIdFields, menuSections } from '#/entity-config';
import { getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { getValidEntity } from '#/permissions/get-valid-entity';
import type { Env } from '#/types/app';
import { memberCountsQuery } from '#/utils/counts';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { TimeSpan, createDate } from '#/utils/time-span';
import { insertMembership } from './helpers/insert-membership';
import membershipRouteConfig from './routes';

const app = new OpenAPIHono<Env>();

// Membership endpoints
const membershipsRoutes = app
  /*
   * Invite members to an entity such as an organization
   */
  .openapi(membershipRouteConfig.createMembership, async (ctx) => {
    const { idOrSlug, entityType: passedEntityType } = ctx.req.valid('query');
    const { emails, role, parentEntity: parentEntityInfo } = ctx.req.valid('json');

    const { entity, isAllowed } = await getValidEntity(passedEntityType, 'update', idOrSlug);
    if (!entity || !isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', passedEntityType);

    const { entity: entityType, id: targetEntityId } = entity;
    const organization = getContextOrganization();
    const user = getContextUser();

    const normalizedEmails = emails.map((email) => email.toLowerCase());

    // Fetch existing memberships and users
    const [allOrgMemberships, existingUsers] = await Promise.all([
      db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.type, 'organization'))),
      getUsersByConditions([inArray(usersTable.email, normalizedEmails)]),
    ]);

    const existingUsersByEmail = new Map(existingUsers.map((user) => [user.email, user]));
    const targetMembershipsByUser = new Map<string, MembershipModel>();
    const userIds = existingUsers.map((user) => user.id);
    const orgMembersIds = allOrgMemberships.map(({ userId }) => userId);

    if (userIds.length) {
      const existingTargetMemberships = await db
        .select()
        .from(membershipsTable)
        .where(
          and(
            eq(membershipsTable[entityIdFields[entityType]], targetEntityId),
            eq(membershipsTable.type, entityType),
            inArray(membershipsTable.userId, userIds),
          ),
        );

      for (const membership of existingTargetMemberships) {
        targetMembershipsByUser.set(membership.userId, membership);
      }
    }

    const emailsToInvite: string[] = [];

    // Establish memberships for existing users
    await Promise.all(
      existingUsers.map(async (existingUser) => {
        existingUsersByEmail.set(existingUser.email, existingUser);

        const targetMembership = targetMembershipsByUser.get(existingUser.id);
        const organizationMembership = orgMembersIds.find((id) => id === existingUser.id);

        if (targetMembership) {
          logEvent(`User already member of ${entityType}`, { user: existingUser.id, id: targetEntityId });

          // Check if the role needs to be updated (downgrade or upgrade)
          if (role && targetMembership.role !== role) {
            await db
              .update(membershipsTable)
              .set({ role, modifiedAt: new Date(), modifiedBy: user.id })
              .where(eq(membershipsTable.id, targetMembership.id));

            logEvent('User role updated', { user: existingUser.id, id: targetEntityId, type: targetMembership.type, role });
          }
        } else {
          // Check if membership creation is allowed and if invitation is needed
          const instantCreateMembership =
            (entityType !== 'organization' && organizationMembership) || (entityType === 'organization' && existingUser.id === user.id);

          if (instantCreateMembership) {
            const parentEntity = parentEntityInfo ? await resolveEntity(parentEntityInfo.entity, parentEntityInfo.idOrSlug) : null;

            const [createdParentMembership, createdMembership] = await Promise.all([
              parentEntity ? insertMembership({ user: existingUser, role, entity: parentEntity }) : Promise.resolve(null),
              insertMembership({ user: existingUser, role, entity, parentEntity }),
            ]);

            // SSE with parentEntity data, to update user's menu
            if (parentEntity && createdParentMembership) {
              sendSSEToUsers([existingUser.id], 'add_entity', {
                newItem: { ...parentEntity, membership: createdParentMembership },
                sectionName: menuSections.find((el) => el.entityType === parentEntity.entity)?.name,
              });
            }

            // SSE with entity data, to update user's menu
            sendSSEToUsers([existingUser.id], 'add_entity', {
              newItem: { ...entity, membership: createdMembership },
              sectionName: menuSections.find((el) => el.entityType === entityType)?.name,
              ...(parentEntity && { parentSlug: parentEntity.slug }),
            });
            // Add email to the invitation list for sending an organization invite to another user
          } else emailsToInvite.push(existingUser.email);
        }
      }),
    );

    // Identify emails that do not have existing users (will need to send a invitation)
    for (const email of normalizedEmails) if (!existingUsersByEmail.has(email)) emailsToInvite.push(email);

    // Send invitations for organization membership
    await Promise.all(
      emailsToInvite.map(async (email) => {
        const targetUser = existingUsersByEmail.get(email);
        // TODO - store hashed token?
        const token = nanoid(40);

        // TODO add here entity ids
        const [tokenRecord] = await db
          .insert(tokensTable)
          .values({
            token,
            type: 'invitation',
            userId: targetUser?.id ?? null,
            email,
            createdBy: user.id,
            role,
            organizationId: organization.id,
            expiresAt: createDate(new TimeSpan(7, 'd')),
          })
          .returning();

        // Render email template
        const emailHtml = await render(
          MemberInviteEmail({
            userName: targetUser?.name,
            userLanguage: targetUser?.language || user.language,
            userThumbnailUrl: targetUser?.thumbnailUrl,
            inviteBy: user.name,
            organizationName: organization.name,
            organizationThumbnailUrl: organization.logoUrl || organization.thumbnailUrl,
            memberInviteLink: `${config.frontendUrl}/invitation/${token}?tokenId=${tokenRecord.id}`,
          }),
        );

        // Log event for user invitation
        logEvent('User invited to organization', { organization: organization.id });

        // Send invitation email
        emailSender.send(
          config.senderIsReceiver ? user.email : email,
          i18n.t('backend:email.member_invite.subject', {
            lng: targetUser?.language || organization.defaultLanguage,
            appName: config.name,
            entity: organization.name,
          }),
          emailHtml,
          user.email,
        );
      }),
    );

    // SSE to update organizations invite info
    // TODO  handle SSE new_member_invite
    if (emailsToInvite.length > 0) {
      sendSSEToUsers(
        allOrgMemberships.map(({ userId }) => userId),
        'new_member_invite',
      );
    }

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete memberships to remove users from entity
   */
  .openapi(membershipRouteConfig.deleteMemberships, async (ctx) => {
    const { entityType, ids, idOrSlug } = ctx.req.valid('query');

    const { entity, isAllowed } = await getValidEntity(entityType, 'delete', idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);
    if (!isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', entityType);

    const user = getContextUser();
    const entityIdField = entityIdFields[entityType];

    // Convert ids to an array
    const memberToDeleteIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    const filters = [eq(membershipsTable.type, entityType), eq(membershipsTable[entityIdField], entity.id)];

    // Get user membership
    const [currentUserMembership]: (MembershipModel | undefined)[] = await db
      .select()
      .from(membershipsTable)
      .where(and(...filters, eq(membershipsTable.userId, user.id)))
      .limit(1);

    // Get target memberships
    const targets = await db
      .select()
      .from(membershipsTable)
      .where(and(inArray(membershipsTable.userId, memberToDeleteIds), ...filters));

    // Check if membership exist
    for (const id of memberToDeleteIds) {
      if (!targets.some((target) => target.userId === id)) {
        errors.push(createError(ctx, 404, 'not_found', 'warn', entityType, { user: id }));
      }
    }

    // Filter out what user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      if (user.role !== 'admin' && currentUserMembership?.role !== 'admin') {
        errors.push(
          createError(ctx, 403, 'delete_resource_forbidden', 'warn', entityType, {
            user: target.userId,
            membership: target.id,
          }),
        );
        return false;
      }

      return true;
    });

    // If the user doesn't have permission to delete any of the memberships, return an error
    if (allowedTargets.length === 0) return ctx.json({ success: false, errors: errors }, 200);

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
      const memberIds = targets.map((el) => el.userId);
      sendSSEToUsers(memberIds, 'remove_entity', { id: entity.id, entity: entity.entity });

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
    const memberships = getContextMemberships();
    const organization = getContextOrganization();

    let orderToUpdate = order;

    // Get the membership in valid organization
    const [membershipToUpdate] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.id, membershipId), eq(membershipsTable.organizationId, organization.id)))
      .limit(1);

    if (!membershipToUpdate) return errorResponse(ctx, 404, 'not_found', 'warn', 'user', { membership: membershipId });

    const updatedType = membershipToUpdate.type;
    const updatedEntityIdField = entityIdFields[updatedType];

    // if archived changed, set lowest order in relevant memberships
    if (archived !== undefined && archived !== membershipToUpdate.archived) {
      const relevantMemberships = memberships.filter((membership) => membership.type === updatedType && membership.archived === archived);

      const lastOrderMembership = relevantMemberships.sort((a, b) => b.order - a.order)[0];

      const ceilOrder = lastOrderMembership ? Math.ceil(lastOrderMembership.order) : 0;

      orderToUpdate = ceilOrder + 10;
    }

    const membershipContextId = membershipToUpdate[updatedEntityIdField];
    if (!membershipContextId) return errorResponse(ctx, 404, 'not_found', 'warn', updatedType);

    const membershipContext = await resolveEntity(updatedType, membershipContextId);
    if (!membershipContext) return errorResponse(ctx, 404, 'not_found', 'warn', updatedType);

    // Check if user has permission to someone elses membership
    if (user.id !== membershipToUpdate.userId) {
      const { entity, isAllowed } = await getValidEntity(updatedType, 'update', membershipContextId);
      if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', updatedType);
      if (!isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', updatedType);
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

    return ctx.json({ success: true, data: updatedMembership }, 200);
  })
  /*
   * Get members by entity id/slug and type
   */
  .openapi(membershipRouteConfig.getMembers, async (ctx) => {
    const { idOrSlug, entityType, q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);

    const entityIdField = entityIdFields[entity.entity];

    // Build search filters
    const $or = [];
    if (q) {
      const query = prepareStringForILikeFilter(q);
      $or.push(ilike(usersTable.name, query), ilike(usersTable.email, query));
    }

    const usersQuery = db
      .select()
      .from(usersTable)
      .where(or(...$or))
      .as('users');
    const membersFilters = [eq(membershipsTable[entityIdField], entity.id), eq(membershipsTable.type, entityType)];

    if (role) membersFilters.push(eq(membershipsTable.role, role));

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(...membersFilters))
      .as('memberships');

    const membershipCount = memberCountsQuery(null, 'userId');

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: usersTable.lastSeenAt,
        role: memberships.role,
      },
      sort,
      usersTable.id,
      order,
    );

    const membersQuery = db
      .select({
        user: safeUserSelect,
        membership: membershipSelect,
        counts: {
          memberships: membershipCount.members,
        },
      })
      .from(usersQuery)
      .innerJoin(memberships, eq(usersTable.id, memberships.userId))
      .leftJoin(membershipCount, eq(usersTable.id, membershipCount.id))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const result = await membersQuery.limit(Number(limit)).offset(Number(offset));

    const members = await Promise.all(
      result.map(async ({ user, membership, counts }) => ({
        ...user,
        membership,
        counts,
      })),
    );

    return ctx.json({ success: true, data: { items: members, total } }, 200);
  })
  /*
   * Get invited members by entity id/slug and type
   */
  .openapi(membershipRouteConfig.getInvitedMembers, async (ctx) => {
    const { idOrSlug, entityType, q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const { entity, isAllowed, membership } = await getValidEntity(entityType, 'read', idOrSlug);

    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);
    if (!isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', entityType);
    if (!membership || membership.role !== 'admin') return errorResponse(ctx, 403, 'forbidden', 'warn', entityType);

    const entityIdField = entityIdFields[entity.entity];

    // Build search filters
    const $or = [];
    if (q) {
      const query = prepareStringForILikeFilter(q);
      $or.push(ilike(usersTable.name, query), ilike(usersTable.email, query));
    }

    const filters = [eq(membershipsTable[entityIdField], entity.id), eq(membershipsTable.type, entityType)];

    if (role) filters.push(eq(membershipsTable.role, role));

    const orderColumn = getOrderColumn(
      {
        id: tokensTable.id,
        name: usersTable.name,
        email: tokensTable.email,
        role: tokensTable.role,
        expiresAt: tokensTable.expiresAt,
        createdAt: tokensTable.createdAt,
        createdBy: tokensTable.createdBy,
      },
      sort,
      tokensTable.createdAt,
      order,
    );

    // TODO create select schema or use existing schema?
    const invitedMembersQuery = db
      .select({
        id: tokensTable.id,
        name: usersTable.name,
        email: tokensTable.email,
        role: tokensTable.role,
        expiresAt: tokensTable.expiresAt,
        createdAt: tokensTable.createdAt,
        createdBy: tokensTable.createdBy,
      })
      .from(tokensTable)
      .where(and(eq(tokensTable[entityIdField], entity.id), eq(tokensTable.type, 'invitation')))
      .leftJoin(usersTable, eq(usersTable.id, tokensTable.userId))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(invitedMembersQuery.as('invites'));

    const result = await invitedMembersQuery.limit(Number(limit)).offset(Number(offset));

    const items = result.map(({ expiresAt, createdAt, ...rest }) => ({
      ...rest,
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
    }));

    return ctx.json({ success: true, data: { items, total } }, 200);
  });

export default membershipsRoutes;
