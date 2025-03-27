import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { entityIdFields } from '#/entity-config';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { i18n } from '#/lib/i18n';
import { mailer } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { getValidEntity } from '#/permissions/get-valid-entity';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { slugFromEmail } from '#/utils/slug-from-email';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { TimeSpan, createDate } from '#/utils/time-span';
import { MemberInviteEmail, type MemberInviteEmailProps } from '../../../emails/member-invite';
import { userSelect } from '../users/helpers/select';
import { getAssociatedEntityDetails, insertMembership } from './helpers';
import { membershipSelect } from './helpers/select';
import membershipsRouteConfig from './routes';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

const membershipsRoutes = app
  /*
   * Create memberships (invite members) for an entity such as an organization
   */
  .openapi(membershipsRouteConfig.createMemberships, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const { idOrSlug, entityType: passedEntityType } = ctx.req.valid('query');

    // Validate entity existence and check user permission for updates
    const { entity, error } = await getValidEntity(ctx, passedEntityType, 'update', idOrSlug);
    if (error) return ctx.json({ success: false, error });

    // Extract entity details
    const { entity: entityType, id: entityId } = entity;
    const targetEntityIdField = entityIdFields[entityType];

    const user = getContextUser();
    const organization = getContextOrganization();

    // Normalize emails
    const normalizedEmails = emails.map((email) => email.toLowerCase());

    // Determine main entity details (if applicable)
    const { associatedEntityType, associatedEntityIdField, associatedEntityId } = getAssociatedEntityDetails(entity);

    // Fetch existing users based on the provided emails
    const existingUsers = await getUsersByConditions([inArray(usersTable.email, normalizedEmails)]);
    const userIds = existingUsers.map(({ id }) => id);

    // Fetch all existing memberships by organizationId
    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), inArray(membershipsTable.userId, userIds)));

    // Map for lookup of existing users by email
    const existingUsersByEmail = new Map(existingUsers.map((eu) => [eu.email, eu]));
    const emailsToInvite: { email: string; userId: string | null }[] = [];

    // Process existing users
    await Promise.all(
      existingUsers.map(async (existingUser) => {
        const { id: userId, email } = existingUser;

        // Filter memberships for current user
        const userMemberships = memberships.filter(({ userId: id }) => id === userId);

        // Check if the user is already a member of the target entity
        const hasTargetMembership = userMemberships.some(({ type }) => type === entityType);
        if (hasTargetMembership) return logEvent(`User already member of ${entityType}`, { user: userId, id: entityId });

        // Check for associated memberships and organization memberships
        const hasAssociatedMembership = userMemberships.some(({ type }) => type === associatedEntityType);
        const hasOrgMembership = userMemberships.some(({ type }) => type === 'organization');

        // Determine if membership should be created instantly
        const instantCreateMembership = (entityType !== 'organization' && hasOrgMembership) || (user.role === 'admin' && userId === user.id);

        // If not instant, add to invite list
        if (!instantCreateMembership) return emailsToInvite.push({ email, userId });

        await insertMembership({ userId: existingUser.id, role, entity, addAssociatedMembership: hasAssociatedMembership });

        // TODO: Add SSE to notify user of instant membership creation
      }),
    );

    // Identify emails without associated users
    for (const email of normalizedEmails) if (!existingUsersByEmail.has(email)) emailsToInvite.push({ email, userId: null });

    // Stop if no recipients
    if (emailsToInvite.length === 0) return ctx.json({ success: true }, 200); // Stop if no recipients to send invites

    // Generate invitation tokens
    const tokens = emailsToInvite.map(({ email, userId }) => ({
      id: nanoid(),
      token: nanoid(40), // unique hashed token
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      role,
      userId,
      entity: entityType,
      [targetEntityIdField]: entityId,
      ...(associatedEntityIdField && associatedEntityId && { [associatedEntityIdField]: associatedEntityId }), // Include associated entity if applicable
      ...(entityType !== 'organization' && { organizationId: organization.id }), // Add org ID if not an organization
    }));

    // Insert tokens first
    const insertedTokens = await db
      .insert(tokensTable)
      .values(tokens)
      .returning({ tokenId: tokensTable.id, userId: tokensTable.userId, email: tokensTable.email, token: tokensTable.token });

    // Generate inactive memberships after tokens are inserted
    const inactiveMemberships = insertedTokens
      .filter(({ userId }) => userId !== null)
      .map(({ tokenId, userId }) => insertMembership({ userId: userId as string, role, entity, tokenId }));

    // Wait for all memberships to be inserted
    await Promise.all(inactiveMemberships);

    // Prepare and send invitation emails
    const recipients = insertedTokens.map(({ email, tokenId, token }) => ({
      email,
      name: slugFromEmail(email),
      memberInviteLink: `${config.frontendUrl}/invitation/${token}?tokenId=${tokenId}`,
    }));

    const emailProps = {
      senderName: user.name,
      senderThumbnailUrl: user.thumbnailUrl,
      orgName: entity.name,
      subject: i18n.t('backend:email.member_invite.subject', {
        lng: organization.defaultLanguage,
        appName: config.name,
        entity: organization.name,
      }),
      lng: organization.defaultLanguage,
    };

    await mailer.prepareEmails<MemberInviteEmailProps, (typeof recipients)[number]>(MemberInviteEmail, emailProps, recipients, user.email);

    logEvent('Users invited to organization', { organization: organization.id }); // Log invitation event

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete memberships to remove users from entity
   * When user is allowed to delete entity, they can delete memberships too
   */
  .openapi(membershipsRouteConfig.deleteMemberships, async (ctx) => {
    const { entityType, idOrSlug } = ctx.req.valid('query');
    const { ids } = ctx.req.valid('json');

    const { entity, error } = await getValidEntity(ctx, entityType, 'delete', idOrSlug);
    if (error) return ctx.json({ success: false, errors: [error] }, 200);

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
  .openapi(membershipsRouteConfig.updateMembership, async (ctx) => {
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

    const membershipContextId = membershipToUpdate[updatedEntityIdField];
    if (!membershipContextId) return errorResponse(ctx, 404, 'not_found', 'warn', updatedType);

    const membershipContext = await resolveEntity(updatedType, membershipContextId);
    if (!membershipContext) return errorResponse(ctx, 404, 'not_found', 'warn', updatedType);

    // Check if user has permission to update context
    const { error } = await getValidEntity(ctx, updatedType, 'update', membershipContextId);
    if (error) return ctx.json({ success: false, error }, 400);

    // If archived changed, set lowest order in relevant memberships
    if (archived !== undefined && archived !== membershipToUpdate.archived) {
      const relevantMemberships = memberships.filter((membership) => membership.type === updatedType && membership.archived === archived);

      const lastOrderMembership = relevantMemberships.sort((a, b) => b.order - a.order)[0];

      const ceilOrder = lastOrderMembership ? Math.ceil(lastOrderMembership.order) : 0;

      orderToUpdate = ceilOrder + 10;
    }

    const [updatedMembership] = await db
      .update(membershipsTable)
      .set({
        role,
        ...(orderToUpdate !== undefined && { order: orderToUpdate }),
        ...(muted !== undefined && { muted }),
        ...(archived !== undefined && { archived }),
        modifiedBy: user.id,
        modifiedAt: getIsoDate(),
      })
      .where(and(eq(membershipsTable.id, membershipId)))
      .returning();

    // Trigger SSE notification only if the update is for a different user
    if (updatedMembership.userId !== user.id) {
      sendSSEToUsers([updatedMembership.userId], 'update_entity', {
        ...membershipContext,
        membership: updatedMembership,
      });
    }

    logEvent('Membership updated', { user: updatedMembership.userId, membership: updatedMembership.id });

    return ctx.json({ success: true, data: updatedMembership }, 200);
  })
  /*
   * Get members by entity id/slug and type
   */
  .openapi(membershipsRouteConfig.getMembers, async (ctx) => {
    const { idOrSlug, entityType, q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const entity = await resolveEntity(entityType, idOrSlug);
    if (!entity) return errorResponse(ctx, 404, 'not_found', 'warn', entityType);

    const entityIdField = entityIdFields[entity.entity];

    // Build search filters
    const $or = q ? [ilike(usersTable.name, prepareStringForILikeFilter(q)), ilike(usersTable.email, prepareStringForILikeFilter(q))] : [];

    const membersFilters = [
      eq(membershipsTable[entityIdField], entity.id),
      eq(membershipsTable.type, entityType),
      isNull(membershipsTable.tokenId),
      isNotNull(membershipsTable.activatedAt),
    ];

    if (role) membersFilters.push(eq(membershipsTable.role, role));

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: usersTable.lastSeenAt,
        role: membershipsTable.role,
      },
      sort,
      usersTable.id,
      order,
    );

    const membersQuery = db
      .select({
        ...getTableColumns(userSelect),
        membership: membershipSelect,
      })
      .from(usersTable)
      .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
      .where(and(...membersFilters, or(...$or)));

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const items = await membersQuery.orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    return ctx.json({ success: true, data: { items, total } }, 200);
  })
  /*
   * Get pending membership invitations by entity id/slug and type
   */
  .openapi(membershipsRouteConfig.getMembershipInvitations, async (ctx) => {
    const { idOrSlug, entityType, sort, order, offset, limit } = ctx.req.valid('query');

    // Scope request to organization
    const organization = getContextOrganization();

    const { entity, error } = await getValidEntity(ctx, entityType, 'read', idOrSlug);
    if (error) return ctx.json({ success: false, error }, 400);

    const entityIdField = entityIdFields[entity.entity];

    const invitedMemberSelect = {
      id: tokensTable.id,
      name: usersTable.name,
      email: tokensTable.email,
      role: tokensTable.role,
      expiresAt: tokensTable.expiresAt,
      createdAt: tokensTable.createdAt,
      createdBy: tokensTable.createdBy,
    };

    const orderColumn = getOrderColumn(invitedMemberSelect, sort, tokensTable.createdAt, order);

    const memberInvitationsQuery = db
      .select(invitedMemberSelect)
      .from(tokensTable)
      .where(
        and(
          eq(tokensTable.type, 'invitation'),
          eq(tokensTable.entity, entity.entity),
          eq(tokensTable[entityIdField], entity.id),
          eq(tokensTable.organizationId, organization.id),
        ),
      )
      .leftJoin(usersTable, eq(usersTable.id, tokensTable.userId))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(memberInvitationsQuery.as('invites'));

    const items = await memberInvitationsQuery.limit(Number(limit)).offset(Number(offset));

    return ctx.json({ success: true, data: { items, total } }, 200);
  });

export default membershipsRoutes;
