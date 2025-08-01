import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, ilike, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { eventManager } from '#/lib/events';
import { mailer } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import { getAssociatedEntityDetails, insertMembership } from '#/modules/memberships/helpers';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import membershipRoutes from '#/modules/memberships/routes';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { userSelect } from '#/modules/users/helpers/select';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { slugFromEmail } from '#/utils/slug-from-email';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { createDate, TimeSpan } from '#/utils/time-span';
import { MemberInviteEmail, type MemberInviteEmailProps } from '../../../emails/member-invite';

const app = new OpenAPIHono<Env>({ defaultHook });

const membershipRouteHandlers = app
  /*
   * Create memberships (invite members) for an entity such as an organization
   */
  .openapi(membershipRoutes.createMemberships, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const { idOrSlug, entityType: passedEntityType } = ctx.req.valid('query');

    // Normalize emails
    const normalizedEmails = emails.map((email) => email.toLowerCase().trim());
    if (!normalizedEmails.length) throw new AppError({ status: 400, type: 'no_recipients', severity: 'warn' });

    // Validate entity existence and check user permission for updates
    const { entity } = await getValidContextEntity(idOrSlug, passedEntityType, 'update');

    // Extract entity details
    const { entityType, id: entityId } = entity;
    const targetEntityIdField = appConfig.entityIdFields[entityType];

    const user = getContextUser();
    const organization = getContextOrganization();

    // Determine main entity details (if applicable)
    const associatedEntity = getAssociatedEntityDetails(entity);

    // Fetch existing users based on the provided emails
    const existingUsers = await getUsersByConditions([inArray(emailsTable.email, normalizedEmails)]);
    const userIds = existingUsers.map(({ id }) => id);

    // Since a user can have multiple emails, we need to check if the email exists in the emails table
    const existingEmails = await db.select().from(emailsTable).where(inArray(emailsTable.email, normalizedEmails));

    // Fetch all existing memberships by organizationId
    const membershipsOfExistingUsers = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), inArray(membershipsTable.userId, userIds)));

    // Fetch all existing tokens by organizationId
    const existingTokens = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.organizationId, organization.id), inArray(tokensTable.email, emails)));

    // Map for lookup of existing users by email
    const existingUsersByEmail = new Map(existingEmails.map((eu) => [eu.email, eu]));
    const emailsWithIdToInvite: { email: string; userId: string | null }[] = [];

    // Process existing users
    await Promise.all(
      existingUsers.map(async (existingUser) => {
        const { id: userId, email } = existingUser;

        // Filter memberships for current user
        const userMemberships = membershipsOfExistingUsers.filter(({ userId: id }) => id === userId);

        // Check if the user is already a member of the target entity
        const targetMembership = userMemberships.find((m) => m[targetEntityIdField] === entityId);
        if (targetMembership) {
          const msg = targetMembership.activatedAt === null ? `User already invited to ${entityType}` : `User already member of ${entityType}`;
          logEvent({ msg, meta: { user: userId, id: entityId } });
          return;
        }

        // Check for associated memberships and organization memberships
        const addAssociatedMembership = associatedEntity ? userMemberships.some((m) => m[associatedEntity.field] === associatedEntity.id) : false;
        const hasOrgMembership = userMemberships.some((m) => m.organizationId === organization.id && m.activatedAt !== null);

        // Determine if membership should be created instantly
        const instantCreateMembership = (entityType !== 'organization' && hasOrgMembership) || (user.role === 'admin' && userId === user.id);

        // If not instant, add to invite list
        if (!instantCreateMembership) return emailsWithIdToInvite.push({ email, userId });

        const createdMembership = await insertMembership({ userId: existingUser.id, role, entity, addAssociatedMembership });

        eventManager.emit('instantMembershipCreation', createdMembership);

        sendSSEToUsers([existingUser.id], 'add_entity', {
          newItem: {
            ...entity,
            membership: createdMembership,
          },
          sectionName: associatedEntity?.type || entity.entityType,
          ...(associatedEntity && { parentIdOrSlug: associatedEntity.id }),
        });
      }),
    );

    // Identify emails without associated users, nor with existing tokens
    for (const email of normalizedEmails) {
      if (existingUsersByEmail.has(email)) continue;

      // There might be emails that are already invited recently
      if (
        existingTokens.some(({ email: tokenEmail, createdAt }) => {
          const tokenCreatedAt = new Date(createdAt);
          const isSameEmail = tokenEmail === email;
          const isRecent = tokenCreatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
          return isSameEmail && isRecent;
        })
      ) {
        logEvent({ msg: 'Invitation to pending user by email address already sent recently', meta: { id: entityId } });
        continue;
      }

      emailsWithIdToInvite.push({ email, userId: null });
    }

    if (emailsWithIdToInvite.length === 0) return ctx.json({ success: false, rejectedItems: normalizedEmails, invitesSended: 0 }, 200);

    // Check create restrictions
    const [{ currentOrgMemberships }] = await db
      .select({ currentOrgMemberships: count() })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.contextType, 'organization'), eq(membershipsTable.organizationId, organization.id)));
    const membersRestrictions = organization.restrictions.user;
    if (membersRestrictions !== 0 && currentOrgMemberships + emailsWithIdToInvite.length > membersRestrictions) {
      throw new AppError({ status: 403, type: 'restrict_by_org', severity: 'warn', entityType });
    }

    // Generate invitation tokens
    const tokens = emailsWithIdToInvite.map(({ email, userId }) => ({
      id: nanoid(),
      token: nanoid(40), // unique hashed token
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      role,
      userId,
      entityType,
      [targetEntityIdField]: entityId,
      ...(associatedEntity && { [associatedEntity.field]: associatedEntity.id }), // Include associated entity if applicable
      ...(entityType !== 'organization' && { organizationId: organization.id }), // Add org ID if not an organization
    }));

    // Insert tokens first
    const insertedTokens = await db
      .insert(tokensTable)
      .values(tokens)
      .returning({ tokenId: tokensTable.id, userId: tokensTable.userId, email: tokensTable.email, token: tokensTable.token, role: tokensTable.role });

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
      memberInviteLink: `${appConfig.frontendUrl}/invitation/${token}?tokenId=${tokenId}`,
    }));

    const emailProps = {
      senderName: user.name,
      senderThumbnailUrl: user.thumbnailUrl,
      orgName: entity.name,
      role,
      subject: i18n.t('backend:email.member_invite.subject', {
        lng: organization.defaultLanguage,
        appName: appConfig.name,
        entityName: organization.name,
      }),
      lng: organization.defaultLanguage,
    };

    await mailer.prepareEmails<MemberInviteEmailProps, (typeof recipients)[number]>(MemberInviteEmail, emailProps, recipients, user.email);

    // Fetch all existing memberships by organizationId
    const adminMemberships = await db
      .selectDistinctOn([membershipsTable.userId], { userId: membershipsTable.userId })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.organizationId, organization.id),
          eq(membershipsTable.role, 'admin'),
          eq(membershipsTable.archived, false),
          isNotNull(membershipsTable.activatedAt),
        ),
      );

    const adminMembersIds = adminMemberships.map(({ userId }) => userId);

    sendSSEToUsers(adminMembersIds, 'invite_members', {
      targetEntity: entity,
      organization,
      invitesCount: recipients.length,
    });

    logEvent({ msg: `${insertedTokens.length} users invited to ${entity.entityType}`, meta: entity }); // Log invitation event

    const rejectedItems = normalizedEmails.filter((email) => !recipients.some((recipient) => recipient.email === email));
    return ctx.json({ success: true, rejectedItems, invitesSended: recipients.length }, 200);
  })
  /*
   * Delete memberships to remove users from entity
   * When user is allowed to delete entity, they can delete memberships too
   */
  .openapi(membershipRoutes.deleteMemberships, async (ctx) => {
    const { entityType, idOrSlug } = ctx.req.valid('query');
    const { ids } = ctx.req.valid('json');

    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'delete');

    const entityIdField = appConfig.entityIdFields[entityType];

    // Convert ids to an array
    const membershipIds = Array.isArray(ids) ? ids : [ids];

    // Get target memberships
    const targets = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          inArray(membershipsTable.userId, membershipIds),
          eq(membershipsTable.contextType, entityType),
          eq(membershipsTable[entityIdField], entity.id),
          isNotNull(membershipsTable.activatedAt),
        ),
      );

    // Check if membership exist
    const rejectedItems: string[] = [];

    for (const id of membershipIds) {
      if (!targets.some((target) => target.userId === id)) rejectedItems.push(id);
    }

    // If the user doesn't have permission to delete any of the memberships, return an error
    if (targets.length === 0) return ctx.json({ success: false, rejectedItems }, 200);

    // Delete the memberships
    await db.delete(membershipsTable).where(
      inArray(
        membershipsTable.id,
        targets.map((target) => target.id),
      ),
    );

    // Send the event to the user if they are a member of the organization
    const memberIds = targets.map((el) => el.userId);
    sendSSEToUsers(memberIds, 'remove_entity', { id: entity.id, entityType: entity.entityType });

    logEvent({ msg: 'Deleted members', meta: { memberIds } });

    return ctx.json({ success: true, rejectedItems }, 200);
  })
  /*
   * Update user membership
   */
  .openapi(membershipRoutes.updateMembership, async (ctx) => {
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
      .where(
        and(eq(membershipsTable.id, membershipId), isNotNull(membershipsTable.activatedAt), eq(membershipsTable.organizationId, organization.id)),
      )
      .limit(1);

    if (!membershipToUpdate) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user', meta: { membership: membershipId } });
    }

    const updatedType = membershipToUpdate.contextType;
    const updatedEntityIdField = appConfig.entityIdFields[updatedType];

    const membershipContextId = membershipToUpdate[updatedEntityIdField];
    if (!membershipContextId) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: updatedType });

    const membershipContext = await resolveEntity(updatedType, membershipContextId);
    if (!membershipContext) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: updatedType });

    // Check if user has permission to update someone elses membership role
    if (role) await getValidContextEntity(membershipContextId, updatedType, 'update');

    // If archived changed, set lowest order in relevant memberships
    if (archived !== undefined && archived !== membershipToUpdate.archived) {
      const relevantMemberships = memberships.filter((membership) => membership.contextType === updatedType && membership.archived === archived);

      const lastOrderMembership = relevantMemberships.sort((a, b) => b.order - a.order)[0];

      const ceilOrder = lastOrderMembership ? Math.ceil(lastOrderMembership.order) : 0;

      orderToUpdate = ceilOrder + 10;
    }

    const [updatedMembership] = await db
      .update(membershipsTable)
      .set({
        ...(role !== undefined && { role }),
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

    logEvent({ msg: 'Membership updated', meta: { user: updatedMembership.userId, membership: updatedMembership.id } });

    return ctx.json(updatedMembership, 200);
  })
  /*
   * Get members by entity id/slug and type
   */
  .openapi(membershipRoutes.getMembers, async (ctx) => {
    const { idOrSlug, entityType, q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const organization = getContextOrganization();

    // Validate entity existence and check read permission
    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'read');

    const entityIdField = appConfig.entityIdFields[entity.entityType];

    // Build search filters
    const $or = q ? [ilike(usersTable.name, prepareStringForILikeFilter(q)), ilike(usersTable.email, prepareStringForILikeFilter(q))] : [];

    const membersFilters = [
      eq(membershipsTable.organizationId, organization.id),
      eq(membershipsTable[entityIdField], entity.id),
      eq(membershipsTable.contextType, entityType),
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
        ...userSelect,
        membership: membershipSummarySelect,
      })
      .from(usersTable)
      .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
      .where(and(...membersFilters, or(...$or)));

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const items = await membersQuery.orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    return ctx.json({ items, total }, 200);
  })
  /*
   * Get pending membership invitations by entity id/slug and type
   */
  .openapi(membershipRoutes.getPendingInvitations, async (ctx) => {
    const { idOrSlug, entityType, sort, order, offset, limit } = ctx.req.valid('query');

    // Scope request to organization
    const organization = getContextOrganization();

    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'read');

    const entityIdField = appConfig.entityIdFields[entity.entityType];

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

    const pendingInvitationsQuery = db
      .select(invitedMemberSelect)
      .from(tokensTable)
      .leftJoin(usersTable, eq(usersTable.id, tokensTable.userId))
      .where(
        and(
          eq(tokensTable.type, 'invitation'),
          eq(tokensTable[entityIdField], entity.id),
          eq(tokensTable.organizationId, organization.id),
          isNotNull(tokensTable.role),
        ),
      )
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(pendingInvitationsQuery.as('invites'));

    const items = await pendingInvitationsQuery.limit(Number(limit)).offset(Number(offset));

    return ctx.json({ items, total }, 200);
  });

export default membershipRouteHandlers;
