import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
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
import { getAssociatedEntityDetails, insertMemberships } from '#/modules/memberships/helpers';
import { membershipBaseQuery, membershipBaseSelect } from '#/modules/memberships/helpers/select';
import membershipRoutes from '#/modules/memberships/routes';
import { memberSelect, userBaseSelect } from '#/modules/users/helpers/select';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { createDate, TimeSpan } from '#/utils/time-span';
import { MemberInviteEmail, type MemberInviteEmailProps } from '../../../emails/member-invite';
import { MemberInviteWithTokenEmail, MemberInviteWithTokenEmailProps } from '../../../emails/member-invite-with-token';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';

const app = new OpenAPIHono<Env>({ defaultHook });

const membershipRouteHandlers = app
  /**
   * Create memberships (invite members) for an entity such as an organization, by list of emails
   * 1. email exists in membershipsTable for this entity with activatedAt -> user is already is member of entity so we remove it from recipients.
   * 1b. email exists in membershipsTable, but no activatedAt -> user will receive a reminder email invitation.
   * 2. email exists in emailsTable -> user is already active in system so no token invitation but create inactive membership send a email invitation with a link to the entity.
   * 3. add to recipients and create another token with email and an inactive membership.
   * 
   * | Scenario | Description                                        | Membership created?                  | Token created?                 |
     | -------- | -------------------------------------------------- | ------------------------------------ | ------------------------------ |
     | **1**    | Already has inactive membership → skip             | ❌                                   | ❌                             |
     | **1b**   | Has membership but not activated → reminder only   | ❌                                   | ❌                             |
     | **2**    | Existing user (verified) but **no membership yet** | ✅                                   | ❌                             |
     | **3**    | New email address (no user in system)              | ❌ (deferred until token is claimed) | ✅ token created in **Step 5** |
   */
  .openapi(membershipRoutes.createMemberships, async (ctx) => {
    // Step 0: Parse and normalize input
    const { emails, role } = ctx.req.valid('json');
    const { idOrSlug, entityType: passedEntityType } = ctx.req.valid('query');

    const normalizedEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))];
    if (!normalizedEmails.length) throw new AppError({ status: 400, type: 'no_recipients', severity: 'warn' });

    // Step 0: Validate target entity and caller permission (update)
    const { entity } = await getValidContextEntity(idOrSlug, passedEntityType, 'update');

    // Step 0: Extract entity context
    const { entityType, id: entityId, slug: entitySlug, name: entityName } = entity;
    const targetEntityIdField = appConfig.entityIdFields[entityType];

    // Step 0: Contextual user and organization
    const user = getContextUser();
    const organization = getContextOrganization();

    // Step 0: Associated entity (optional hierarchy metadata)
    const associatedEntity = getAssociatedEntityDetails(entity);

    // Step 0: Scenario buckets
    const rejectedItems: string[] = []; // Scenario 1: already active members
    const reminderEmails: string[] = []; // Scenario 1b: pending members (no token email)
    const existingUsersToActivate: Array<{
      // Scenario 2: create inactive membership, email link
      userId: string;
      email: string;
    }> = [];
    const newUserTokenEmails: string[] = []; // Scenario 3: new users -> create token + email with token

    // Step 0: Email meta for outgoing messages
    const lng = appConfig.defaultLanguage;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.member_invite.subject', { lng, entityName });

    // Step 1: Single membership-aware lookup for all emails (email -> user -> membership for this entity)
    const membershipAwareRows = await db
      .select({
        email: emailsTable.email, // email identifier
        userId: usersTable.id, // nullable if no user
        language: usersTable.language || entity.defaultLanguage, // use user's language or entity's default
        membershipId: membershipsTable.id, // nullable if no membership
      })
      .from(emailsTable)
      .leftJoin(usersTable, eq(usersTable.id, emailsTable.userId))
      .leftJoin(
        membershipsTable,
        and(
          eq(membershipsTable.userId, usersTable.id),
          eq(membershipsTable.contextType, entityType as any),
          eq(membershipsTable[targetEntityIdField as keyof typeof membershipsTable] as any, entityId),
        ),
      )
      .where(and(inArray(emailsTable.email, normalizedEmails)));

    // Step 1b: Index rows by email (handle potential duplicates defensively)
    const rowsByEmail = new Map<string, typeof membershipAwareRows>();
    for (const e of normalizedEmails) rowsByEmail.set(e, [] as any);
    for (const r of membershipAwareRows) rowsByEmail.get(r.email)!.push(r);

    // Step 1c: Bucket by scenarios using the pre-fetched data
    for (const email of normalizedEmails) {
      const rows = rowsByEmail.get(email)!; // array (possibly empty)

      // Step 1c.i: If we have any row with an activated membership, Scenario 1
      if (rows.some((r) => r.membershipId && r.activatedAt)) {
        rejectedItems.push(email);
        continue;
      }

      // Step 1c.ii: If we have a membership but not activated, Scenario 1b
      if (rows.some((r) => r.membershipId && !r.activatedAt)) {
        reminderEmails.push(email);
        continue;
      }

      // Step 1c.iii: If we have a user (but no membership), Scenario 2
      const userRow = rows.find((r) => r.userId);
      if (userRow?.userId) {
        existingUsersToActivate.push({ userId: userRow.userId, email });
        continue;
      }

      // Step 1c.iv: Otherwise, brand-new user, Scenario 3
      newUserTokenEmails.push(email);
    }

    // Step 2: Bulk create inactive memberships for Scenario 2 (existing users)
    if (existingUsersToActivate.length > 0) {
      // Step 2a: Build bulk insert rows for membershipsTable
      const membershipsToInsert = existingUsersToActivate.map(({ userId }) => ({
        userId,
        role,
        entity,
        activate: false,
        createdBy: user.id,
      }));

      // Step 2b: Insert in one shot
      await insertMemberships(membershipsToInsert);
    }

    // Step 3: Prepare no-token recipients (Scenario 1b + Scenario 2)
    const memberInviteNoTokenLink = `${appConfig.frontendUrl}/${entityType}/${entitySlug}`;

    const noTokenRecipients = [
      // Step 3a: Scenario 2 invitations for existing users (inactive memberships were created)
      ...existingUsersToActivate.map(({ email }) => {
        return { email, lng, name: slugFromEmail(email), memberInviteLink: memberInviteNoTokenLink };
      }),
      // Step 3b: Scenario 1b reminders for pending members
      ...reminderEmails.map((email) => {
        return { email, lng, name: slugFromEmail(email), memberInviteLink: memberInviteNoTokenLink };
      }),
    ];

    // Step 4: Bulk-create fresh invitation tokens for Scenario 3 (no tokensTable lookup)
    const rawTokens: Array<{ email: string; raw: string }> = [];
    const tokensToInsert = newUserTokenEmails.map((email) => {
      // Step 4a: Generate raw + hashed token
      const raw = nanoid(40);
      const hashed = encodeLowerCased(raw);
      rawTokens.push({ email, raw });

      // Step 4b: Build token record (membership for new users is deferred upon using the token session)
      return {
        token: hashed,
        type: 'invitation' as const,
        email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
        role,
        entityType,
        [targetEntityIdField]: entityId,
        ...(associatedEntity && { [associatedEntity.field]: associatedEntity.id }),
        ...(entityType !== 'organization' && { organizationId: organization.id }),
      };
    });

    // Step 5: Insert tokens in bulk (Scenario 3)
    let insertedTokens: Array<{ id: string; email: string; token: string; type: string }> = [];
    if (tokensToInsert.length > 0) {
      insertedTokens = await db
        .insert(tokensTable)
        .values(tokensToInsert)
        .returning({ id: tokensTable.id, email: tokensTable.email, token: tokensTable.token, type: tokensTable.type });

      // Step 5b: Link waitlist requests to new tokens (if any)
      await Promise.all(
        insertedTokens.map(({ id, email }) =>
          db
            .update(requestsTable)
            .set({ tokenId: id })
            .where(and(eq(requestsTable.email, email), eq(requestsTable.type, 'waitlist'))),
        ),
      );
    }

    // Step 6: Prepare "with-token" recipients (Scenario 3)
    const rawByEmail = new Map(rawTokens.map((t) => [t.email, t.raw]));

    const withTokenRecipients = insertedTokens.map(({ email, type }) => {
      const rawToken = rawByEmail.get(email)!; // guaranteed from same source list
      const memberInviteLink = `${appConfig.backendAuthUrl}/invoke-token/${type}/${rawToken}`;

      return { email, lng, name: slugFromEmail(email), memberInviteLink };
    });

    // Step 7: Send no-token emails for Scenarios 1b + 2
    if (noTokenRecipients.length > 0) {
      const staticProps = { senderName, senderThumbnailUrl, subject, lng, role, entityName };
      await mailer.prepareEmails<MemberInviteEmailProps, (typeof noTokenRecipients)[number]>(
        MemberInviteEmail,
        staticProps,
        noTokenRecipients,
        user.email,
      );
    }

    // Step 8: Send with-token emails for Scenario 3
    if (withTokenRecipients.length > 0) {
      const staticProps = { senderName, senderThumbnailUrl, subject, lng, role, entityName };
      await mailer.prepareEmails<MemberInviteWithTokenEmailProps, (typeof withTokenRecipients)[number]>(
        MemberInviteWithTokenEmail,
        staticProps,
        withTokenRecipients,
        user.email,
      );
    }

    // Step 9: Compute and return outcome
    const invitesSentCount = noTokenRecipients.length + withTokenRecipients.length; // excludes already members

    logEvent('info', 'Users invited on entity level', { count: invitesSentCount, entityType, [targetEntityIdField]: entityId });

    return ctx.json({ success: invitesSentCount > 0, rejectedItems, invitesSentCount }, 200);
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
    const targets = await membershipBaseQuery().where(
      and(inArray(membershipsTable.userId, membershipIds), eq(membershipsTable[entityIdField], entity.id)),
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
    sendSSEToUsers(memberIds, 'membership_deleted', { id: entity.id, entityType: entity.entityType });

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
    const [membershipToUpdate] = await membershipBaseQuery()
      .where(
        and(eq(membershipsTable.id, membershipId), eq(membershipsTable.organizationId, organization.id)),
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
      sendSSEToUsers([updatedMembership.userId], 'membership_updated', {
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

    const [organizationMembership] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(and(eq(inactiveMembershipsTable.id, membershipId), eq(inactiveMembershipsTable.userId, user.id), eq(inactiveMembershipsTable.contextType, 'organization')))
      .limit(1);

    if (!organizationMembership) throw new AppError({ status: 404, type: 'membership_not_found', severity: 'error', meta: { membershipId } });

    if (acceptOrReject === 'accept') {
      // Activate memberships, can be multiple if there are nested entity memberships. Eg. organization and project
      // TODO test this in raak for projects and edge cases
      const activatedMemberships = await db
        .update(membershipsTable)
        .set({ activatedAt: getIsoDate() })
        .where(and(eq(membershipsTable.id, organizationMembership.id)))
        .returning();

      eventManager.emit('acceptedMembership', organizationMembership);

      logEvent('info', 'Accepted memberships', { ids: activatedMemberships.map((m) => m.id) });
    }

    // Reject membership simply deletes the membership
    if (acceptOrReject === 'reject') await db.delete(membershipsTable).where(and(eq(membershipsTable.id, organizationMembership.id)));

    const entity = await resolveEntity('organization', organizationMembership.organizationId);
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

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('members'));

    const items = await membersQuery.orderBy(orderColumn).limit(limit).offset(offset);

    return ctx.json({ items, total }, 200);
  })
  /**
   * Get pending memberships by entity id/slug and type.
   */
  .openapi(membershipRoutes.getPendingMemberships, async (ctx) => {
    const { idOrSlug, entityType, sort, order, offset, limit } = ctx.req.valid('query');

    const organization = getContextOrganization();
    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'read');
    const entityIdField = appConfig.entityIdFields[entity.entityType];

    const table = inactiveMembershipsTable
    const orderColumn = getOrderColumn({ createdAt: table.createdAt }, sort, table.createdAt, order);

    const pendingMembershipsQuery = db
      .select({
        id: table.id,
        role: table.role,
        userId: table.userId,
        tokenId: table.tokenId,
        email: userBaseSelect.email,
        thumbnailUrl: sql<string | null>`${userBaseSelect.thumbnailUrl}`.as('thumbnailUrl'),
        createdAt: table.createdAt,
        createdBy: table.createdBy,
      })
      .from(table)
      .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
      .where(
        and(
          eq(table[entityIdField], entity.id),
          eq(table.organizationId, organization.id),
        ),
      )
      .orderBy(orderColumn);

    const items = await pendingMembershipsQuery.limit(limit).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(pendingMembershipsQuery.as('pendingMemberships'));

    return ctx.json({ items, total }, 200);
  });

export default membershipRouteHandlers;
