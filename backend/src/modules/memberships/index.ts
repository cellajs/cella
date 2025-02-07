import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';

import { db } from '#/db/db';
import { type MembershipModel, membershipSelect, membershipsTable } from '#/db/schema/memberships';

import { config } from 'config';
import { mailer } from '#/lib/mailer';

import { tokensTable } from '#/db/schema/tokens';
import { safeUserSelect, usersTable } from '#/db/schema/users';
import { entityIdFields, entityRelations } from '#/entity-config';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUsersByConditions } from '#/modules/users/helpers/utils';
import { getValidEntity } from '#/permissions/get-valid-entity';
import { memberCountsQuery } from '#/utils/counts';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { encodeLowerCased } from '#/utils/oslo';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { TimeSpan, createDate } from '#/utils/time-span';
import { MemberInviteEmail, type MemberInviteEmailProps } from '../../../emails/member-invite';
import { slugFromEmail } from '../auth/helpers/oauth';
import { insertMembership } from './helpers';
import membershipRouteConfig from './routes';

const app = new OpenAPIHono<Env>();

// Membership endpoints
const membershipsRoutes = app
  /*
   * Invite members to an entity such as an organization
   */
  // TODO simplify this, put parts in helper functions
  .openapi(membershipRouteConfig.createMemberships, async (ctx) => {
    const { idOrSlug, entityType } = ctx.req.valid('query');

    // Allowed to invite members to an entity when user has update permission on the entity
    const { entity, isAllowed } = await getValidEntity(entityType, 'update', idOrSlug);
    if (!entity || !isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', entityType);

    const { emails, role } = ctx.req.valid('json');

    const organization = getContextOrganization();
    const user = getContextUser();

    // Normalize emails for consistent comparison
    const normalizedEmails = emails.map((email) => email.toLowerCase());

    // Query existing memberships and users
    const existingUsers = await getUsersByConditions([inArray(usersTable.email, normalizedEmails)]);

    // Maps to store memberships by existing user
    const organizationMembershipsByUser = new Map<string, MembershipModel>();
    const contextMembershipsByUser = new Map<string, MembershipModel>();
    const contextEntityIdField = entityIdFields[entity.entity];

    if (existingUsers.length) {
      const userIds = existingUsers.map((user) => user.id);

      // Prepare conditions for fetching existing memberships
      const $where = [
        and(
          eq(membershipsTable[contextEntityIdField], entity.id),
          eq(membershipsTable.type, entity.entity),
          inArray(membershipsTable.userId, userIds),
        ),
      ];

      // Add conditions for organization memberships if applicable
      if (entity.entity !== 'organization') {
        $where.push(
          and(
            eq(membershipsTable.type, 'organization'),
            eq(membershipsTable.organizationId, organization.id),
            inArray(membershipsTable.userId, userIds),
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
        if (membership.userId && membership.type === entity.entity) contextMembershipsByUser.set(membership.userId, membership);
      }
    }

    // Initialize tracking maps
    const existingUsersByEmail = new Map();
    const emailsToSendInvitation: { email: string; userId: string | null }[] = [];

    // Establish memberships for existing users
    await Promise.all(
      existingUsers.map(async (existingUser) => {
        existingUsersByEmail.set(existingUser.email, existingUser);

        const existingMembership = contextMembershipsByUser.get(existingUser.id);
        const organizationMembership = organizationMembershipsByUser.get(existingUser.id);

        if (existingMembership) {
          logEvent(`User already member of ${entity.entity}`, { user: existingUser.id, id: entity.id });

          // Check if the role needs to be updated (downgrade or upgrade)
          if (role && existingMembership.role !== role) {
            await db
              .update(membershipsTable)
              .set({ role, modifiedAt: new Date(), modifiedBy: user.id })
              .where(eq(membershipsTable.id, existingMembership.id));

            logEvent('User role updated', { user: existingUser.id, id: entity.id, type: existingMembership.type, role });
          }
        } else {
          // Check if membership creation is allowed and if invitation is needed
          const instantCreateMembership =
            (entity.entity !== 'organization' && organizationMembership) || (entity.entity === 'organization' && existingUser.id === user.id);

          if (instantCreateMembership) {
            // const parentEntity = parentEntityInfo ? await resolveEntity(parentEntityInfo.entity, parentEntityInfo.idOrSlug) : null;

            // TODO-entitymap map over entityIdFields
            const [createdMembership] = await Promise.all([
              // parentEntity ? insertMembership({ user: existingUser, role, entity: parentEntity }) : Promise.resolve(null),
              insertMembership({ user: existingUser, role, entity: entity }),
            ]);

            // if (parentEntity && createdParentMembership) {
            //   // SSE with parentEntity data, to update user's menu
            //   sendSSEToUsers([existingUser.id], 'add_entity', {
            //     newItem: { ...parentEntity, membership: createdParentMembership },
            //     sectionName: menuSections.find((el) => el.entityType === parentEntity.entity)?.name,
            //   });
            // }

            // SSE with entity data, to update user's menu
            sendSSEToUsers([existingUser.id], 'add_entity', {
              newItem: { ...entity, membership: createdMembership },
              sectionName: entityRelations.find((el) => el.entity === entity.entity)?.menuSectionName,
              // TODO-entitymap map over entityIdFields
              // ...(parentEntity && { parentSlug: parentEntity.slug }),
            });
            // Add email to the invitation list for sending an organization invite to another user
          } else emailsToSendInvitation.push({ email: existingUser.email, userId: existingUser.id });
        }
      }),
    );

    // Identify emails that do not have existing users (will need to send a invitation)
    for (const email of normalizedEmails) if (!existingUsersByEmail.has(email)) emailsToSendInvitation.push({ email, userId: null });

    // Stop if no recipients
    if (emailsToSendInvitation.length === 0) return errorResponse(ctx, 400, 'no_recipients', 'warn');

    // Generate tokens
    const tokens = emailsToSendInvitation.map(({ email, userId }) => {
      const hashedToken = encodeLowerCased(nanoid());

      return {
        token: hashedToken,
        type: 'invitation' as const,
        email: email.toLowerCase(),
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
        role,
        userId,
        organizationId: organization.id,
      };
    });

    // Batch insert tokens
    const insertedTokens = await db.insert(tokensTable).values(tokens).returning();

    // Prepare emails
    const orgName = entity.name;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.member_invite.subject', {
      lng: organization.defaultLanguage,
      appName: config.name,
      entity: organization.name,
    });

    const recipients = insertedTokens.map((tokenRecord) => ({
      email: tokenRecord.email,
      name: slugFromEmail(tokenRecord.email),
      memberInviteLink: `${config.frontendUrl}/invitation/${tokenRecord.token}?tokenId=${tokenRecord.id}`,
    }));

    type Recipient = (typeof recipients)[number];

    // Send invitation
    const staticProps = { senderName, senderThumbnailUrl, orgName, subject, lng: organization.defaultLanguage };
    await mailer.prepareEmails<MemberInviteEmailProps, Recipient>(MemberInviteEmail, staticProps, recipients, user.email);

    // Log event for user invitation
    logEvent('Users invited to organization', { organization: organization.id });

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete memberships to remove users from entity
   * When user is allowed to delete entity, they can delete memberships too
   */
  .openapi(membershipRouteConfig.deleteMemberships, async (ctx) => {
    const { entityType, idOrSlug } = ctx.req.valid('query');
    const { ids } = ctx.req.valid('json');

    const { entity, isAllowed } = await getValidEntity(entityType, 'delete', idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);
    if (!isAllowed) return errorResponse(ctx, 403, 'forbidden', 'warn', entityType);

    const entityIdField = entityIdFields[entityType];

    // Convert ids to an array
    const membershipIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    const filters = [eq(membershipsTable.type, entityType), eq(membershipsTable[entityIdField], entity.id)];

    // Get target memberships
    const targets = await db
      .select()
      .from(membershipsTable)
      .where(and(inArray(membershipsTable.userId, membershipIds), ...filters));

    // Check if membership exist
    for (const id of membershipIds) {
      if (!targets.some((target) => target.userId === id)) {
        errors.push(createError(ctx, 404, 'not_found', 'warn', entityType, { user: id }));
      }
    }

    // If the user doesn't have permission to delete any of the memberships, return an error
    if (targets.length === 0) return ctx.json({ success: false, errors: errors }, 200);

    // Delete the memberships
    await db.delete(membershipsTable).where(
      inArray(
        membershipsTable.id,
        targets.map((target) => target.id),
      ),
    );

    // Send SSE events for the memberships that were deleted
    for (const membership of targets) {
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
      .select({ user: safeUserSelect })
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
  });

export default membershipsRoutes;
