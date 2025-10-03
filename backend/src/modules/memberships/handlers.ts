import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { requestsTable } from '#/db/schema/requests';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/errors';
import { eventManager } from '#/lib/events';
import { mailer } from '#/lib/mailer';
import { sendSSEToUsers } from '#/lib/sse';
import { getAssociatedEntityDetails, insertMembership } from '#/modules/memberships/helpers';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import membershipRoutes from '#/modules/memberships/routes';
import { memberSelect, userSelect } from '#/modules/users/helpers/select';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { slugFromEmail } from '#/utils/slug-from-email';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { createDate, TimeSpan } from '#/utils/time-span';
import { SystemInviteEmail, SystemInviteEmailProps } from '../../../emails/system-invite';

const app = new OpenAPIHono<Env>({ defaultHook });

const membershipRouteHandlers = app
  /**
   * Create memberships (invite members) for an entity such as an organization
   * TODO: rework this to not use tokens if not necessary.
   * 1. email doesn't exist in emailsTable AND not in tokensTable (so no pending invitation) -> add to recipients list and create invitation token.
   * 2. email doesn't exist in emailsTable BUT does exist in tokensTable (so pending invitation already) -> if token is expired, add to recipients,
   * remove the old token and create a new one.
   * 3. email exists in emailsTable: dont create a token but just s membership without activation.
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

    // Determine additional entity details (if applicable)
    const associatedEntity = getAssociatedEntityDetails(entity);

    const user = getContextUser();
    const organization = getContextOrganization();

    const existingUsers = await db
      .select({ id: userSelect.id, email: emailsTable.email })
      .from(usersTable)
      .leftJoin(emailsTable, and(eq(usersTable.id, emailsTable.userId), eq(emailsTable.verified, true)))
      .where(inArray(emailsTable.email, normalizedEmails));

    // 2) Pending invitation tokens for normalized emails
    const pendingTokens = await db
      .select({
        id: tokensTable.id,
        userId: tokensTable.userId,
        email: tokensTable.email,
        expiresAt: tokensTable.expiresAt,
        invokedAt: tokensTable.invokedAt,
      })
      .from(tokensTable)
      .where(
        and(
          inArray(tokensTable.email, normalizedEmails),
          eq(tokensTable.type, 'invitation'),
          isNull(tokensTable.invokedAt), // pending (not used)
        ),
      );

    const notInAppEmails = normalizedEmails.filter(
      (email) => !existingUsers.some((user) => user.email === email) && !pendingTokens.some((user) => user.email === email),
    );

    const organizationWideMemberships = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          inArray(
            membershipsTable.userId,
            existingUsers.map(({ id }) => id),
          ),
          eq(membershipsTable.organizationId, organization.id),
          isNull(membershipsTable.tokenId),
          isNotNull(membershipsTable.activatedAt),
        ),
      );

    const rejectedItems: string[] = [];
    let invitesCount = 0;

    await Promise.all(
      normalizedEmails
        .filter((email) => notInAppEmails.includes(email))
        .map(async (email) => {
          const existingUser = existingUsers.find((user) => user.email === email);
          const userPending = pendingTokens.some((user) => user.email === email);

          if (existingUser) {
            const userMemberships = organizationWideMemberships.filter((m) => m.userId === existingUser.id);
            // Check if the user is already a member of the target entity
            const targetMembership = userMemberships.find((m) => m.contextType === entityType && m[targetEntityIdField] === entityId);
            if (targetMembership) {
              rejectedItems.push(email);
              logEvent('info', `User already member of ${entityType}`, { userId: existingUser.id, [targetEntityIdField]: entityId });
              return;
            }

            // Check for organization memberships
            const hasOrgMembership = userMemberships.some((m) => m.contextType === 'organization' && m.organizationId === organization.id);

            // Determine if membership should be created instantly
            const instantCreateMembership =
              (entityType !== 'organization' && hasOrgMembership) || (user.role === 'admin' && existingUser.id === user.id);

            const createdMembership = await insertMembership({ userId: existingUser.id, role, entity, activate: instantCreateMembership });
            invitesCount++;
            // If not instant, add to invite list
            if (!instantCreateMembership) return;

            eventManager.emit('instantMembershipCreation', createdMembership);

            sendSSEToUsers([existingUser.id], 'add_entity', {
              newItem: {
                ...entity,
                membership: createdMembership,
              },
              sectionName: associatedEntity?.type || entity.entityType,
              ...(associatedEntity && { parentIdOrSlug: associatedEntity.id }),
            });
          }

          if (userPending) {
            const [updatedInviteToken] = await db
              .update(tokensTable)
              .set({ expiresAt: createDate(new TimeSpan(7, 'd')) })
              .where(
                and(
                  eq(tokensTable.email, email),
                  eq(tokensTable.type, 'invitation'),
                  isNull(tokensTable.invokedAt), // pending (not used)
                ),
              )
              .returning();

            if (updatedInviteToken && updatedInviteToken.userId) {
              await insertMembership({ userId: updatedInviteToken.userId, role, entity, activate: false });
            }
          }
        }),
    );

    if (!notInAppEmails.length) return ctx.json({ success: false, rejectedItems, invitesCount }, 200);

    // // Check create restrictions
    // const [{ currentOrgMemberships }] = await db
    //   .select({ currentOrgMemberships: count() })
    //   .from(membershipsTable)
    //   .where(and(eq(membershipsTable.contextType, 'organization'), eq(membershipsTable.organizationId, organization.id)));
    // const membersRestrictions = organization.restrictions.user;
    // if (membersRestrictions !== 0 && currentOrgMemberships + emailsWithIdToInvite.length > membersRestrictions) {
    //   throw new AppError({ status: 403, type: 'restrict_by_org', severity: 'warn', entityType });
    // }

    // Generate invitation tokens
    const tokens = notInAppEmails.map((email) => ({
      token: nanoid(40), // unique hashed token
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      userId: nanoid(),
    }));

    const insertedTokens = await db.insert(tokensTable).values(tokens).returning();

    await Promise.all(
      insertedTokens.flatMap((token) => {
        const requestUpldateQuery = db
          .update(requestsTable)
          .set({ tokenId: token.id })
          .where(and(eq(requestsTable.email, token.email), eq(requestsTable.type, 'waitlist')));

        const insertMemberships = insertMembership({ userId: token.userId as string, role, entity, tokenId: token.id });
        return [insertMemberships, requestUpldateQuery];
      }),
    );

    const lng = appConfig.defaultLanguage;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.system_invite.subject', { lng, appName: appConfig.name });
    // Prepare & send emails
    const recipients = insertedTokens.map((t) => ({
      email: t.email,
      lng: appConfig.defaultLanguage,
      name: slugFromEmail(t.email),
      systemInviteLink: `${appConfig.backendAuthUrl}/invoke-token/${t.type}/${t.token}`,
    }));
    type Recipient = (typeof recipients)[number];

    const staticProps = { senderName, senderThumbnailUrl, subject, lng };
    await mailer.prepareEmails<SystemInviteEmailProps, Recipient>(SystemInviteEmail, staticProps, recipients, user.email);

    logEvent('info', 'Users invited on system level', { count: recipients.length });

    return ctx.json({ success: true, rejectedItems, invitesCount }, 200);
  })
  /**
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
      .where(and(inArray(membershipsTable.userId, membershipIds), eq(membershipsTable[entityIdField], entity.id)));

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

    logEvent('info', 'Deleted members', memberIds);

    return ctx.json({ success: true, rejectedItems }, 200);
  })
  /**
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

    logEvent('info', 'Membership updated', { userId: updatedMembership.userId, membershipId: updatedMembership.id });

    return ctx.json(updatedMembership, 200);
  })
  /**
   * Accept - or reject - organization membership invitation
   */
  .openapi(membershipRoutes.handleMembershipInvitation, async (ctx) => {
    const { id: membershipId, acceptOrReject } = ctx.req.valid('param');

    const user = getContextUser();

    // TODO use get membership util
    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.id, membershipId), isNotNull(membershipsTable.tokenId)))
      .limit(1);

    if (!membership) throw new AppError({ status: 404, type: 'membership_not_found', severity: 'error', meta: { membershipId } });

    // Make sure correct user accepts invitation (for example another user could have a sessions and click on email invite of another user)
    if (user.id !== membership.userId) throw new AppError({ status: 401, type: 'user_mismatch', severity: 'error' });

    // Can't accept already active membership
    if (membership.activatedAt) throw new AppError({ status: 400, type: 'membership_already_active', severity: 'error', meta: { membershipId } });

    // Can't accept membership without token
    if (!membership.tokenId) throw new AppError({ status: 400, type: 'membership_without_token', severity: 'error', meta: { membershipId } });

    // Make sure its an organization membership
    if (membership.contextType !== 'organization') throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn' });

    if (acceptOrReject === 'accept') {
      // Activate memberships, can be multiple if there are nested entity memberships. Eg. organization and project
      // TODO test this in raak for projects and edge cases
      const activatedMemberships = await db
        .update(membershipsTable)
        .set({ tokenId: null, activatedAt: getIsoDate() })
        .where(and(eq(membershipsTable.tokenId, membership.tokenId)))
        .returning();

      eventManager.emit('acceptedMembership', membership);

      logEvent('info', 'Accepted memberships', { ids: activatedMemberships.map((m) => m.id) });
    }

    if (acceptOrReject === 'reject') await db.delete(tokensTable).where(and(eq(tokensTable.id, membership.tokenId)));

    const entity = await resolveEntity('organization', membership.organizationId);
    if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'error', entityType: 'organization' });

    return ctx.json(entity, 200);
  })
  /**
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
        ...memberSelect,
        membership: membershipBaseSelect,
      })
      .from(usersTable)
      .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
      .where(and(...membersFilters, or(...$or)));

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const items = await membersQuery.orderBy(orderColumn).limit(limit).offset(offset);

    return ctx.json({ items, total }, 200);
  })
  /**
   * Get pending membership invitations by entity id/slug and type
   */
  .openapi(membershipRoutes.getPendingInvitations, async (ctx) => {
    const { idOrSlug, entityType, sort, order, offset, limit } = ctx.req.valid('query');

    // Scope request to organization
    const organization = getContextOrganization();

    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'read');

    const entityIdField = appConfig.entityIdFields[entity.entityType];

    // TODO optimize this code
    const invitedMemberSelect = {
      id: membershipsTable.id,
      name: usersTable.name,
      email: sql<string>`coalesce(${usersTable.email}, ${tokensTable.email})`.as('email'),
      role: membershipsTable.role,
      createdAt: membershipsTable.createdAt,
      createdBy: membershipsTable.createdBy,
    };

    const orderColumn = getOrderColumn(invitedMemberSelect, sort, membershipsTable.createdAt, order);

    const pendingInvitationsQuery = db
      .select(invitedMemberSelect)
      .from(membershipsTable)
      .leftJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
      .leftJoin(tokensTable, eq(tokensTable.id, membershipsTable.tokenId))
      .where(
        and(
          eq(membershipsTable[entityIdField], entity.id),
          eq(membershipsTable.organizationId, organization.id),
          isNull(membershipsTable.activatedAt),
        ),
      )
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(pendingInvitationsQuery.as('invites'));

    const items = await pendingInvitationsQuery.limit(limit).offset(offset);

    return ctx.json({ items, total }, 200);
  })
  /**
   * Resend invitation email for entity invites.
   */
  .openapi(membershipRoutes.resendInvitation, async (ctx) => {
    // const { email, tokenId } = ctx.req.valid('json');
    // const normalizedEmail = email.toLowerCase().trim();

    // const filters = [
    //   eq(tokensTable.type, 'invitation'),
    //   eq(tokensTable.email, normalizedEmail),
    //   isNotNull(tokensTable.entityType),
    //   isNotNull(tokensTable.role),
    //   isNull(tokensTable.invokedAt),
    // ];
    // if (tokenId) filters.push(eq(tokensTable.id, tokenId));

    // // Retrieve token
    // const [oldToken] = await db
    //   .select()
    //   .from(tokensTable)
    //   .where(and(...filters))
    //   .orderBy(desc(tokensTable.createdAt))
    //   .limit(1);

    // if (!oldToken) throw new AppError({ status: 404, type: 'not_found', severity: 'warn' });

    // const { entityType, role, email: userEmail } = oldToken;

    // if (!entityType || !role) throw new AppError({ status: 401, type: 'invalid_request', severity: 'warn' });

    // const entityIdField = appConfig.entityIdFields[entityType];
    // const entityId = oldToken[entityIdField];
    // if (!entityId) throw new AppError({ status: 404, type: 'not_found', severity: 'warn' });

    // const entity = await resolveEntity(entityType, entityId);
    // if (!entity) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType });

    // // Insert token first
    // const [{ newTokenId, newToken }] = await db
    //   .insert(tokensTable)
    //   .values({
    //     ...oldToken,
    //     id: nanoid(),
    //     token: nanoid(40), // unique hashed token
    //     expiresAt: createDate(new TimeSpan(7, 'd')),
    //   })
    //   .returning({ newTokenId: tokensTable.id, newToken: tokensTable.token });

    // // Update membership record with new token
    // await db
    //   .update(membershipsTable)
    //   .set({ tokenId: newTokenId })
    //   .where(and(eq(membershipsTable.tokenId, oldToken.id)));

    // // Delete old token (avoid triggering cascade prematurely)
    // await db.delete(tokensTable).where(eq(tokensTable.id, oldToken.id));

    // // Prepare and send invitation email
    // const recipient = {
    //   email: userEmail,
    //   name: slugFromEmail(userEmail),
    //   memberInviteLink: `${appConfig.backendAuthUrl}/invoke-token/${oldToken.type}/${newToken}`,
    // };

    // const emailProps = {
    //   entityName: entity.name,
    //   role,
    //   subject: i18n.t('backend:email.member_invite.subject', {
    //     lng: 'defaultLanguage' in entity ? entity.defaultLanguage : 'en',
    //     entityName: entity.name,
    //   }),
    //   lng: 'defaultLanguage' in entity ? entity.defaultLanguage : 'en',
    // };

    // await mailer.prepareEmails<MemberInviteEmailProps, typeof recipient>(MemberInviteEmail, emailProps, [recipient], userEmail);

    // logEvent('info', 'Invitation has been resent', { [entityIdField]: entity.id });

    return ctx.json(true, 200);
  });

export default membershipRouteHandlers;
