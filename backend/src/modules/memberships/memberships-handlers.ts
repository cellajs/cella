import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import i18n from 'i18next';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { lastSeenTable } from '#/db/schema/last-seen';
import { membershipsTable } from '#/db/schema/memberships';
import { requestsTable } from '#/db/schema/requests';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import {
  type Env,
  getContextMemberships,
  getContextOrganization,
  getContextUser,
  getContextUserSystemRole,
} from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { AppError } from '#/lib/error';

import { mailer } from '#/lib/mailer';
import { sendSSEByUserIds } from '#/lib/sse';
import { getBaseMembershipEntityId, insertMemberships } from '#/modules/memberships/helpers';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import membershipRoutes from '#/modules/memberships/memberships-routes';
import { memberSelect, userBaseSelect } from '#/modules/user/helpers/select';
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
import { MemberInviteEmail, MemberInviteWithTokenEmail } from '../../../emails';

const app = new OpenAPIHono<Env>({ defaultHook });

const membershipsRouteHandlers = app
  /**
   * Create memberships (invite members) for an entity such as an organization or project, by list of emails.
   * It will create multiple  memberships for each user and each entity if the entity has associated (parent) entities.
   * For example, inviting a user to a project create an
   * inactive organization membership if the user is not already a member of the associated organization. However,
   * if the user is already an active member of the organization, only a direct project membership is created.
   *
   * When an inactive membership is created, an invitation token is also created and emailed to the user.
   *
   * | Scenario | Description                                        | (Inactive) Memberships?       | Token?     |
   | -------- | -------------------------------------------------- | ----------------------------- | ---------- |
   | **1**    | Already has active membership → skip               | ❌                             | ❌         |
   | **1b**   | Has inactive membership → reminder only            | ❌                             | ❌         |
   | **2a**   | Existing user but no (org) membership yet          | ✅  inactive membership        | ❌         |
   | **2b**   | Existing user with active org membership           | ✅  direct membership          | ❌         |
   | **3**    | New email address (no user in system)              | ✅  inactive membership        | ✅         |
   */
  .openapi(membershipRoutes.createMemberships, async (ctx) => {
    // Step 0: Parse and normalize input
    const { emails, role } = ctx.req.valid('json');
    const { idOrSlug, entityType } = ctx.req.valid('query');

    const normalizedEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))];
    if (!normalizedEmails.length) throw new AppError(400, 'no_recipients', 'warn');

    // Step 0: Validate target entity and caller permission (update)
    const { entity } = await getValidContextEntity(idOrSlug, entityType, 'update');

    // Step 0: Extract entity context
    const { id: entityId, slug: entitySlug, name: entityName } = entity;
    const targetEntityIdField = appConfig.entityIdColumnKeys[entityType];

    // Step 0: Contextual user and organization
    const user = getContextUser();
    const userSystemRole = getContextUserSystemRole();
    const organization = getContextOrganization();

    // Step 0: Scenario buckets
    const rejectedItems: string[] = []; // Scenario 1: already active members
    const reminderEmails: string[] = []; // Scenario 1b: pending members (no token email)
    const existingUsersToActivate: Array<{ userId: string; email: string }> = []; // Scenario 2: existing users to activate memberships
    const existingUsersToDirectAdd: Array<{ userId: string; email: string }> = []; // Scenario 2b: existing users with active org membership to directly add
    const newUserTokenEmails: string[] = []; // Scenario 3: new users -> create token + email with token

    // we'll collect all inactive memberships here and insert once later
    const inactiveMembershipsToInsert: any[] = [];

    // Step 0: Email meta for outgoing messages
    const lng = appConfig.defaultLanguage;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.member_invite.subject', { lng, entityName });

    // Step 1: Single membership-aware lookup for all emails (email -> user -> membership for this entity)
    // [2b] We also need to know if the user has an active organization membership when inviting to a child entity.
    const orgMemberships = alias(membershipsTable, 'org_memberships'); // drizzle alias

    const membershipAwareRows = await db
      .select({
        email: emailsTable.email, // email identifier
        userId: usersTable.id, // nullable if no user
        language:
          usersTable.language || ('defaultLanguage' in entity ? entity.defaultLanguage : appConfig.defaultLanguage), // use user's language or entity's or app default
        membershipId: membershipsTable.id, // nullable if no membership
        inactiveMembershipId: inactiveMembershipsTable.id, // nullable if no inactive membership
        orgMembershipId: orgMemberships.id,
        tokenId: tokensTable.id, // include token via join (pending invitations)
      })
      .from(emailsTable)
      .leftJoin(usersTable, eq(usersTable.id, emailsTable.userId))
      .leftJoin(
        membershipsTable,
        and(
          eq(membershipsTable.userId, usersTable.id),
          eq(membershipsTable.contextType, entityType),
          eq(membershipsTable[targetEntityIdField], entityId),
        ),
      )
      // join inactiveMemberships by userId OR email so we also see email-only invites
      .leftJoin(
        inactiveMembershipsTable,
        and(
          eq(inactiveMembershipsTable.contextType, entityType),
          eq(inactiveMembershipsTable[targetEntityIdField], entityId),
          or(eq(inactiveMembershipsTable.userId, usersTable.id), eq(inactiveMembershipsTable.email, emailsTable.email)),
        ),
      )
      // join tokens using inactiveMemberships.tokenId (type 'invitation' only)
      .leftJoin(
        tokensTable,
        and(eq(tokensTable.id, inactiveMembershipsTable.tokenId), eq(tokensTable.type, 'invitation')),
      )
      .leftJoin(
        orgMemberships,
        and(
          eq(orgMemberships.userId, usersTable.id),
          eq(orgMemberships.contextType, 'organization'),
          eq(orgMemberships.organizationId, organization.id),
        ),
      )
      .where(and(inArray(emailsTable.email, normalizedEmails)));

    // Step 1b: Index rows by email in emailsTable (handle potential duplicates defensively)
    const rowsByEmail = new Map<string, typeof membershipAwareRows>();
    for (const e of normalizedEmails) rowsByEmail.set(e, [] as any);
    for (const r of membershipAwareRows) rowsByEmail.get(r.email)!.push(r);

    // Step 1c: Bucket by scenarios using the pre-fetched data
    for (const email of normalizedEmails) {
      const rows = rowsByEmail.get(email)!; // possibly []

      const hasActiveMembership = rows.some((r) => r.membershipId);
      const hasUserInactiveMembership = rows.some((r) => r.inactiveMembershipId);
      const hasTokenInvite = rows.some((r) => r.tokenId); // from joined tokens

      // Scenario 1: already has active membership → skip
      if (hasActiveMembership) {
        rejectedItems.push(email);
        continue;
      }

      // Scenario 1b: pending members (either user-based inactive or email+token)
      if (hasUserInactiveMembership || hasTokenInvite) {
        reminderEmails.push(email);
        continue;
      }

      // Scenario 2: existing user but no membership yet
      const userRow = rows.find((r) => r.userId);
      if (userRow?.userId) {
        const isAdminInvitingSelf = user.email === email && userSystemRole === 'admin';

        if (isAdminInvitingSelf) {
          existingUsersToDirectAdd.push({ userId: userRow.userId, email });
        } else {
          const hasActiveOrgMembership = entityType !== 'organization' && !!rows.find((r) => r.orgMembershipId);

          if (hasActiveOrgMembership) {
            existingUsersToDirectAdd.push({ userId: userRow.userId, email }); // 2b
          } else {
            existingUsersToActivate.push({ userId: userRow.userId, email }); // 2a
          }
        }
        continue;
      }

      // Scenario 3: truly new email — no user, no membership, no token invite
      newUserTokenEmails.push(email);
    }

    // Step 2: Bulk create memberships
    // For Scenario 2a we collect inactive memberships to insert later in one bulk call
    if (existingUsersToActivate.length > 0) {
      const inactiveMembershipsForExistingUsers = existingUsersToActivate.map(({ userId, email }) => ({
        email,
        userId,
        role,
        entity,
        createdBy: user.id,
        contextType: entityType,
        uniqueKey: `${userId}-${entityId}`,
        ...getBaseMembershipEntityId(entity),
      }));

      inactiveMembershipsToInsert.push(...inactiveMembershipsForExistingUsers);
    }

    // For Scenario 2b (existing users to directly add)
    if (existingUsersToDirectAdd.length > 0) {
      const membershipsToInsert = existingUsersToDirectAdd.map(({ userId }) => ({
        userId,
        role,
        entity,
        createdBy: user.id,
      }));

      await insertMemberships(membershipsToInsert);
    }

    // Step 3: Prepare no-token recipients (Scenario 1b + Scenario 2)
    const memberInviteNoTokenLink = `${appConfig.frontendUrl}/${entityType}/${entitySlug}`;

    const noTokenRecipients = [
      // Scenario 2 invitations for existing users (inactive memberships were created)
      ...existingUsersToActivate.map(({ email }) => {
        return { email, lng, name: slugFromEmail(email), memberInviteLink: memberInviteNoTokenLink };
      }),
      // Scenario 1b reminders for pending members
      ...reminderEmails.map((email) => {
        return { email, lng, name: slugFromEmail(email), memberInviteLink: memberInviteNoTokenLink };
      }),
    ];

    // Step 4: Bulk-create fresh invitation tokens for Scenario 3 (new users)

    // 🔑 Pre-generate inactiveMembership IDs
    const newUserInactiveMembershipIdsByEmail = new Map<string, string>();
    for (const email of newUserTokenEmails) newUserInactiveMembershipIdsByEmail.set(email, nanoid());

    const rawTokens: Array<{ email: string; raw: string }> = [];
    const tokensToInsert = newUserTokenEmails.map((email) => {
      const raw = nanoid(40);
      const hashed = encodeLowerCased(raw);
      rawTokens.push({ email, raw });

      return {
        token: hashed,
        type: 'invitation' as const,
        email,
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
        role,
        entityType,
        inactiveMembershipId: newUserInactiveMembershipIdsByEmail.get(email)!,
        ...getBaseMembershipEntityId(entity),
      };
    });

    // Step 5: Insert tokens in bulk (Scenario 3)
    let insertedTokens: Array<{ id: string; email: string; token: string; type: string }> = [];
    if (tokensToInsert.length > 0) {
      insertedTokens = await db.insert(tokensTable).values(tokensToInsert).returning({
        id: tokensTable.id,
        email: tokensTable.email,
        token: tokensTable.token,
        type: tokensTable.type,
      });

      // Step 5b: Link waitlist requests to new tokens (if any)
      // TODO: This should be handled by eventManager in requests module itself
      await Promise.all(
        insertedTokens.map(({ id, email }) =>
          db
            .update(requestsTable)
            .set({ tokenId: id })
            .where(and(eq(requestsTable.email, email), eq(requestsTable.type, 'waitlist'))),
        ),
      );
    }

    // Step 5c – create inactive memberships for Scenario 2a + 3 in one bulk insert
    let insertedInactiveMemberships: Array<{ id: string; email: string }> = [];

    if (newUserTokenEmails.length > 0 && insertedTokens.length > 0) {
      const tokensByEmail = new Map(insertedTokens.map((t) => [t.email, t.id]));

      const newUserInactiveMemberships = newUserTokenEmails.map((email) => ({
        id: newUserInactiveMembershipIdsByEmail.get(email)!, // use pre-generated ID
        email,
        role,
        entity,
        createdBy: user.id,
        contextType: entityType,
        tokenId: tokensByEmail.get(email)!, // link inactive membership → token
        uniqueKey: `${email}-${entityId}`,
        ...getBaseMembershipEntityId(entity),
      }));

      inactiveMembershipsToInsert.push(...newUserInactiveMemberships);
    }

    if (inactiveMembershipsToInsert.length > 0) {
      insertedInactiveMemberships = await db
        .insert(inactiveMembershipsTable)
        .values(inactiveMembershipsToInsert)
        .onConflictDoNothing()
        .returning({
          id: inactiveMembershipsTable.id,
          email: inactiveMembershipsTable.email,
        });
    }

    // Step 6: Prepare "with-token" recipients (Scenario 3)
    const rawByEmail = new Map(rawTokens.map((t) => [t.email, t.raw]));

    const withTokenRecipients = insertedTokens
      .filter(({ email }) => insertedInactiveMemberships.some((m) => m.email === email))
      .map(({ email, type }) => {
        const rawToken = rawByEmail.get(email)!;
        const inviteLink = `${appConfig.backendAuthUrl}/invoke-token/${type}/${rawToken}`;

        return { email, lng, name: slugFromEmail(email), inviteLink };
      });

    // Static email props are same for each scenario
    const staticProps = { senderName, senderThumbnailUrl, subject, lng, role, entityName };

    // Step 7: Send basic invite emails for Scenarios 1b + 2a
    if (noTokenRecipients.length > 0) {
      await mailer.prepareEmails(MemberInviteEmail, staticProps, noTokenRecipients, user.email);
    }

    // TODO for scenario 2b we might want to send a different email notifying user of direct addition

    // Step 8: Send invite with token emails for Scenario 3
    if (withTokenRecipients.length > 0) {
      await mailer.prepareEmails(MemberInviteWithTokenEmail, staticProps, withTokenRecipients, user.email);
    }

    const invitesSentCount = insertedInactiveMemberships.length;

    // Check restrictions: max members in organization
    const [{ currentOrgMemberships }] = await db
      .select({ currentOrgMemberships: count() })
      .from(membershipsTable)
      .where(
        and(eq(membershipsTable.contextType, 'organization'), eq(membershipsTable.organizationId, organization.id)),
      );

    const membersRestrictions = organization.restrictions.user;
    if (membersRestrictions !== 0 && currentOrgMemberships + invitesSentCount > membersRestrictions) {
      throw new AppError(403, 'restrict_by_org', 'warn', { entityType });
    }

    logEvent('info', 'Users invited on entity level', {
      count: invitesSentCount,
      entityType,
      [targetEntityIdField]: entityId,
    });

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

    const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];

    // Convert ids to an array
    const membershipIds = Array.isArray(ids) ? ids : [ids];

    // Get target memberships
    const targets = await db
      .select(membershipBaseSelect)
      .from(membershipsTable)
      .where(and(inArray(membershipsTable.userId, membershipIds), eq(membershipsTable[entityIdColumnKey], entity.id)));

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

    // Send event to users that had their membership deleted
    const memberIds = targets.map((el) => el.userId);
    sendSSEByUserIds(memberIds, 'membership_deleted', { entityId: entity.id, entityType: entity.entityType });

    logEvent('info', 'Deleted memberships', memberIds);

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
      .select(membershipBaseSelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.id, membershipId), eq(membershipsTable.organizationId, organization.id)))
      .limit(1);

    if (!membershipToUpdate) {
      throw new AppError(404, 'not_found', 'warn', {
        entityType: 'user',
        meta: { membership: membershipId },
      });
    }

    const updatedType = membershipToUpdate.contextType;
    const updatedEntityIdField = appConfig.entityIdColumnKeys[updatedType];

    const membershipContextId = membershipToUpdate[updatedEntityIdField];
    if (!membershipContextId)
      throw new AppError(500, 'server_error', 'error', {
        entityType: updatedType,
      });

    const membershipContext = await resolveEntity(updatedType, membershipContextId);
    if (!membershipContext)
      throw new AppError(404, 'not_found', 'warn', {
        entityType: updatedType,
      });

    // Check if user has permission to update someone elses membership role
    if (role) await getValidContextEntity(membershipContextId, updatedType, 'update');

    // If archived changed, set lowest order in relevant memberships
    if (archived !== undefined && archived !== membershipToUpdate.archived) {
      const relevantMemberships = memberships.filter(
        (membership) => membership.contextType === updatedType && membership.archived === archived,
      );

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

    // Send event only if update is for a different user
    if (updatedMembership.userId !== user.id) {
      sendSSEByUserIds([updatedMembership.userId], 'membership_updated', {
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
    const { id: inactiveMembershipId, acceptOrReject } = ctx.req.valid('param');

    const user = getContextUser();

    const [inactiveMembership] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(and(eq(inactiveMembershipsTable.id, inactiveMembershipId), eq(inactiveMembershipsTable.userId, user.id)))
      .limit(1);

    if (!inactiveMembership)
      throw new AppError(404, 'inactive_membership_not_found', 'error', {
        meta: { id: inactiveMembershipId },
      });

    if (acceptOrReject === 'accept') {
      const entityFieldIdName = appConfig.entityIdColumnKeys[inactiveMembership.contextType];
      const entityFieldId = inactiveMembership[entityFieldIdName];
      if (!entityFieldId)
        throw new AppError(500, 'server_error', 'error', {
          entityType: inactiveMembership.contextType,
        });

      const entity = await resolveEntity(inactiveMembership.contextType, entityFieldId);
      if (!entity)
        throw new AppError(404, 'not_found', 'error', {
          entityType: inactiveMembership.contextType,
        });

      const activatedMemberships = await insertMemberships([
        { entity, userId: user.id, role: inactiveMembership.role, createdBy: inactiveMembership.createdBy },
      ]);

      await db.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

      // Event emitted via CDC -> activities table -> eventBus ('membership.created')
      logEvent('info', 'Accepted membership', { ids: activatedMemberships.map((m) => m.id) });
    }

    // Reject membership simply deletes the membership
    if (acceptOrReject === 'reject') {
      await db
        .update(inactiveMembershipsTable)
        .set({ rejectedAt: getIsoDate() })
        .where(and(eq(inactiveMembershipsTable.id, inactiveMembership.id)));
    }

    const entity = await resolveEntity('organization', inactiveMembership.organizationId);
    if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: 'organization' });

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

    const entityIdColumnKey = appConfig.entityIdColumnKeys[entity.entityType];

    // Build search filters
    const $or = q
      ? [
          ilike(usersTable.name, prepareStringForILikeFilter(q)),
          ilike(usersTable.email, prepareStringForILikeFilter(q)),
        ]
      : [];

    const membersFilters = [
      eq(membershipsTable.organizationId, organization.id),
      eq(membershipsTable[entityIdColumnKey], entity.id),
      eq(membershipsTable.contextType, entityType),
    ];

    if (role) membersFilters.push(eq(membershipsTable.role, role));

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: sql`(SELECT ${lastSeenTable.lastSeenAt} FROM ${lastSeenTable} WHERE ${lastSeenTable.userId} = ${usersTable.id})`,
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
    const entityIdColumnKey = appConfig.entityIdColumnKeys[entity.entityType];

    const table = inactiveMembershipsTable;
    const orderColumn = getOrderColumn({ createdAt: table.createdAt }, sort, table.createdAt, order);

    const pendingMembershipsQuery = db
      .select({
        id: table.id,
        role: table.role,
        userId: table.userId,
        // Prefer user email, fall back to token email
        email: sql<string>`coalesce(
        ${userBaseSelect.email},
        ${tokensTable.email}
        )`.as('email'),
        thumbnailUrl: sql<string | null>`${userBaseSelect.thumbnailUrl}`.as('thumbnailUrl'),
        createdAt: table.createdAt,
        createdBy: table.createdBy,
      })
      .from(table)
      // User is optional because user may not exist yet, just a token and inactive membership
      .leftJoin(usersTable, eq(usersTable.id, table.userId))
      .leftJoin(tokensTable, and(eq(tokensTable.inactiveMembershipId, table.id), eq(tokensTable.type, 'invitation')))
      .where(and(eq(table[entityIdColumnKey], entity.id), eq(table.organizationId, organization.id)))
      .orderBy(orderColumn);

    const items = await pendingMembershipsQuery.limit(limit).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(pendingMembershipsQuery.as('pendingMemberships'));

    return ctx.json({ items, total }, 200);
  });

export default membershipsRouteHandlers;
