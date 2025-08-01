import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, gt, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type MembershipModel, membershipsTable } from '#/db/schema/memberships';
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

    // Determine additional entity details (if applicable)
    const associatedEntity = getAssociatedEntityDetails(entity);

    const user = getContextUser();
    const organization = getContextOrganization();

    // Fetch all existing tokens by organizationId
    const allInvitesToken = await db
      .select()
      .from(tokensTable)
      .where(
        and(
          eq(tokensTable.organizationId, organization.id),
          eq(tokensTable.type, 'invitation'),
          inArray(tokensTable.email, normalizedEmails),
          isNotNull(tokensTable.entityType),
          gt(tokensTable.expiresAt, new Date()),
        ),
      );

    const organizationWideInvites = allInvitesToken.filter((token) => token.entityType !== entityType);
    // Map invited emails for filtering
    const directlyInvitedEmails = new Set(
      allInvitesToken.filter((token) => token[targetEntityIdField] === entityId && token.entityType === entityType).map(({ email }) => email),
    );
    const organizationInvitedEmails = new Set(organizationWideInvites.map(({ email }) => email));

    // Log existing direct entity invites
    logEvent({
      msg: `Skipped ${directlyInvitedEmails.size} emails due to existing invitations`,
      meta: { id: entityId, emails: Array.from(directlyInvitedEmails) },
    });
    // Log re-associated entity invites
    logEvent({
      msg: `Re-associated ${organizationInvitedEmails.size} existing invites to target entity`,
      meta: {
        id: entityId,
        emails: Array.from(organizationInvitedEmails),
      },
    });

    // Update organization-wide tokens to point to the current entity (if needed)
    await Promise.all(
      organizationWideInvites
        .filter((token) => !directlyInvitedEmails.has(token.email)) // make sure we don't touch those already fully set
        .map((token) =>
          db
            .update(tokensTable)
            .set({
              entityType: entityType,
              [targetEntityIdField]: entityId,
              ...(associatedEntity && { [associatedEntity.field]: associatedEntity.id }),
              expiresAt: createDate(new TimeSpan(7, 'd')),
            })
            .where(eq(tokensTable.id, token.id)),
        ),
    );

    // Exclude already-invited emails (in both direct & org scope)
    const emailsToInvite = normalizedEmails.filter((email) => !directlyInvitedEmails.has(email) && !organizationInvitedEmails.has(email));

    // Fetch existing users based and their memberships on the provided emails
    const existingUsers = await db
      .select({
        id: userSelect.id,
        email: userSelect.email,
        userMemberships: sql<MembershipModel[]>`coalesce(jsonb_agg(${membershipsTable}.*), '[]'::jsonb)`.as('memberships'),
      })
      .from(usersTable)
      .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
      .leftJoin(
        membershipsTable,
        and(eq(membershipsTable.userId, usersTable.id), eq(membershipsTable.organizationId, organization.id), isNull(membershipsTable.tokenId)),
      )
      .where(and(inArray(emailsTable.email, emailsToInvite)))
      .groupBy(usersTable.id);

    // Map for lookup of existing users by email
    // Identify emails without associated users, nor with existing tokens
    const emailsWithIdToInvite: { email: string; userId: string | null }[] = emailsToInvite.map((email) => ({ email, userId: null }));

    // Process existing users
    await Promise.all(
      existingUsers.map(async ({ id: userId, email, userMemberships }) => {
        // Check if the user is already a member of the target entity
        const targetMembership = userMemberships.find((m) => m.contextType === entityType && m[targetEntityIdField] === entityId);
        if (targetMembership) {
          logEvent({ msg: `User already member of ${entityType}`, meta: { user: userId, id: entityId } });
          return;
        }

        // Check for organization memberships
        const hasOrgMembership = userMemberships.some((m) => m.contextType === 'organization' && m.organizationId === organization.id);
        // Determine if membership should be created instantly
        const instantCreateMembership = (entityType !== 'organization' && hasOrgMembership) || (user.role === 'admin' && userId === user.id);

        // If not instant, add to invite list
        if (!instantCreateMembership) return emailsWithIdToInvite.push({ email, userId });

        // Check for associated memberships
        const addAssociatedMembership = associatedEntity
          ? userMemberships.some((m) => m.contextType === associatedEntity.type && m[associatedEntity.field] === associatedEntity.id)
          : false;

        const createdMembership = await insertMembership({ userId, role, entity, addAssociatedMembership });

        eventManager.emit('instantMembershipCreation', createdMembership);

        sendSSEToUsers([userId], 'add_entity', {
          newItem: {
            ...entity,
            membership: createdMembership,
          },
          sectionName: associatedEntity?.type || entity.entityType,
          ...(associatedEntity && { parentIdOrSlug: associatedEntity.id }),
        });
      }),
    );

    if (!emailsWithIdToInvite.length) return ctx.json({ success: false, rejectedItems: normalizedEmails, invitesSended: 0 }, 200);

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
      .returning({ tokenId: tokensTable.id, userId: tokensTable.userId, email: tokensTable.email, token: tokensTable.token });

    // Generate inactive memberships after tokens are inserted
    await Promise.all(
      insertedTokens
        .filter(({ userId }) => userId !== null)
        .map(({ tokenId, userId }) => insertMembership({ userId: userId as string, role, entity, tokenId })),
    );

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
        entityType: organization.name,
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
        and(inArray(membershipsTable.userId, membershipIds), eq(membershipsTable[entityIdField], entity.id), isNotNull(membershipsTable.activatedAt)),
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
