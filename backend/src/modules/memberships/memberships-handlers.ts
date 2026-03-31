import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import i18n from 'i18next';
import { appConfig, hierarchy } from 'shared';
import { nanoid } from 'shared/nanoid';
import { baseDb } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';
import { userCountersTable } from '#/db/schema/user-counters';
import { usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { mailer } from '#/lib/mailer';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { resolveEntity } from '#/modules/entities/helpers/resolve-entity';
import { getBaseMembershipEntityId, insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import {
  countMembershipsByContext,
  countPendingInvitesByContext,
  deleteMembershipsByIds,
  findInactiveMembershipForUser,
  findMembershipAwareRows,
  findMembershipByIdInOrg,
  findMembershipsByUserIdsAndContext,
  insertInactiveMemberships,
  insertTokens,
  updateMembership,
} from '#/modules/memberships/memberships-queries';
import membershipRoutes from '#/modules/memberships/memberships-routes';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { memberSelect, userBaseSelect } from '#/modules/user/helpers/select';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { createDate, TimeSpan } from '#/utils/time-span';
import { MemberAddedEmail, MemberInviteEmail, MemberInviteWithTokenEmail } from '../../../emails';

const app = new OpenAPIHono<Env>({ defaultHook });

// The root context entity type (e.g. 'organization') — derived from hierarchy
const rootContextType = hierarchy.contextTypes.find((t) => hierarchy.getParent(t) === null)!;

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
app.openapi(membershipRoutes.createMemberships, async (ctx) => {
  // Step 0: Infrastructure
  const db = ctx.var.db;
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const organization = ctx.var.organization;

  // Step 0: Parse and normalize input
  const { emails, role } = ctx.req.valid('json');
  const { entityId, entityType } = ctx.req.valid('query');

  const normalizedEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))];
  if (!normalizedEmails.length) throw new AppError(400, 'no_recipients', 'warn');

  // Step 0: Validate target entity and caller permission (update)
  const { entity } = await getValidContextEntity(ctx, entityId, entityType, 'update');

  // Step 0: Extract entity context
  const { slug: entitySlug, name: entityName } = entity;

  // Step 0: Check restrictions before proceeding — max members in organization
  const currentOrgMemberships = await countMembershipsByContext(ctx, {
    contextType: rootContextType,
    contextId: organization.id,
  });
  const pendingInvites = await countPendingInvitesByContext(ctx, {
    contextType: rootContextType,
    contextId: organization.id,
  });

  const membersRestrictions = ctx.var.tenant.restrictions.quotas.user;
  if (
    membersRestrictions !== 0 &&
    currentOrgMemberships + pendingInvites + normalizedEmails.length > membersRestrictions
  ) {
    throw new AppError(403, 'restrict_by_org', 'warn', { entityType });
  }

  // Step 0: Scenario buckets
  const rejectedIds: string[] = []; // Scenario 1: already active members
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
  const membershipAwareRows = await findMembershipAwareRows(ctx, {
    emails: normalizedEmails,
    entityType,
    entityId: entity.id,
  });

  // Step 1b: Index rows by email in emailsTable (handle potential duplicates defensively)
  type MembershipAwareRow = (typeof membershipAwareRows)[number];
  const rowsByEmail = new Map<string, MembershipAwareRow[]>();
  for (const e of normalizedEmails) rowsByEmail.set(e, []);
  for (const r of membershipAwareRows) rowsByEmail.get(r.email)!.push(r);

  // Step 1c: Bucket by scenarios using the pre-fetched data
  for (const email of normalizedEmails) {
    const rows = rowsByEmail.get(email)!; // possibly []

    const hasActiveMembership = rows.some((r) => r.membershipId);
    const hasUserInactiveMembership = rows.some((r) => r.inactiveMembershipId);
    const hasTokenInvite = rows.some((r) => r.tokenId); // from joined tokens

    // Scenario 1: already has active membership → skip
    if (hasActiveMembership) {
      rejectedIds.push(email);
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
      const isAdminInvitingSelf = user.email === email && isSystemAdmin;

      if (isAdminInvitingSelf) {
        existingUsersToDirectAdd.push({ userId: userRow.userId, email });
      } else {
        const hasActiveOrgMembership = entityType !== rootContextType && !!rows.find((r) => r.orgMembershipId);

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
      tenantId: ctx.var.tenantId,
      ...getBaseMembershipEntityId(entity),
      contextId: entity.id,
    }));

    inactiveMembershipsToInsert.push(...inactiveMembershipsForExistingUsers);
  }

  // For Scenario 2b (existing users to directly add)
  let createdMemberships: Awaited<ReturnType<typeof insertMemberships>> = [];
  if (existingUsersToDirectAdd.length > 0) {
    const membershipsToInsert = existingUsersToDirectAdd.map(({ userId }) => ({
      userId,
      role,
      entity: { ...entity, tenantId: ctx.var.tenantId },
      createdBy: user.id,
    }));

    createdMemberships = await insertMemberships(db, membershipsToInsert, ctx);
    for (const { userId } of existingUsersToDirectAdd) invalidateCache.user(userId);
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
      secret: hashed,
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      role,
      entityType,
      inactiveMembershipId: newUserInactiveMembershipIdsByEmail.get(email)!,
      ...getBaseMembershipEntityId(entity),
      contextId: entity.id,
    };
  });

  // Step 5: Insert tokens in bulk (Scenario 3)
  let insertedTokens: Array<{ id: string; email: string; secret: string; type: string }> = [];
  if (tokensToInsert.length > 0) {
    insertedTokens = await insertTokens(ctx, tokensToInsert);
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
      tenantId: ctx.var.tenantId,
      ...getBaseMembershipEntityId(entity),
      contextId: entity.id,
    }));

    inactiveMembershipsToInsert.push(...newUserInactiveMemberships);
  }

  if (inactiveMembershipsToInsert.length > 0) {
    insertedInactiveMemberships = await insertInactiveMemberships(ctx, inactiveMembershipsToInsert);
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

  // Step 7b: Send direct addition notification for Scenario 2b
  const entityLink = `${appConfig.frontendUrl}/${entityType}/${entitySlug}`;
  const directAdditionRecipients = existingUsersToDirectAdd.map(({ email }) => ({
    email,
    lng,
    name: slugFromEmail(email),
    entityLink,
  }));

  if (directAdditionRecipients.length > 0) {
    await mailer.prepareEmails(MemberAddedEmail, staticProps, directAdditionRecipients, user.email);
  }

  // Step 8: Send invite with token emails for Scenario 3
  if (withTokenRecipients.length > 0) {
    await mailer.prepareEmails(MemberInviteWithTokenEmail, staticProps, withTokenRecipients, user.email);
  }

  const invitesSentCount = insertedInactiveMemberships.length;

  logEvent(ctx, 'info', 'Users invited on entity level', {
    count: invitesSentCount,
    entityType,
    entityId,
  });

  return ctx.json({ data: createdMemberships, rejectedIds, invitesSentCount }, 200);
});

/**
 * Delete memberships to remove users from entity
 * When user is allowed to delete entity, they can delete memberships too
 */
app.openapi(membershipRoutes.deleteMemberships, async (ctx) => {
  const { entityType, entityId } = ctx.req.valid('query');
  const { ids } = ctx.req.valid('json');

  const { entity } = await getValidContextEntity(ctx, entityId, entityType, 'delete');

  // Convert ids to an array
  const membershipIds = Array.isArray(ids) ? ids : [ids];

  // Get target memberships
  const targets = await findMembershipsByUserIdsAndContext(ctx, { userIds: membershipIds, contextId: entity.id });

  // Check if membership exist
  const rejectedIds: string[] = [];

  for (const id of membershipIds) {
    if (!targets.some((target) => target.userId === id)) rejectedIds.push(id);
  }

  // If the user doesn't have permission to delete any of the memberships, return an error
  if (targets.length === 0) return ctx.json({ data: [] as never[], rejectedIds }, 200);

  // Delete the memberships
  await deleteMembershipsByIds(ctx, {
    ids: targets.map((target) => target.id),
  });

  for (const target of targets) invalidateCache.user(target.userId);

  // Event emitted via CDC -> activities table -> activityBus ('membership.deleted')
  logEvent(ctx, 'info', 'Memberships deleted', { count: targets.length, ids: targets.map((t) => t.userId) });

  return ctx.json({ data: [] as never[], rejectedIds }, 200);
});

/**
 * Update user membership
 */
app.openapi(membershipRoutes.updateMembership, async (ctx) => {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  const { id: membershipId } = ctx.req.valid('param');
  const { role, archived, muted, displayOrder } = ctx.req.valid('json');

  let orderToUpdate = displayOrder;

  // Get the membership in valid organization
  const membershipToUpdate = await findMembershipByIdInOrg(ctx, { membershipId });

  if (!membershipToUpdate) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  const updatedType = membershipToUpdate.contextType;

  // Validate entity existence and check permission (read for self-updates, update for role changes)
  await getValidContextEntity(ctx, membershipToUpdate.contextId, updatedType, role ? 'update' : 'read');

  // If archived changed, set lowest order in relevant memberships
  if (archived !== undefined && archived !== membershipToUpdate.archived) {
    const relevantMemberships = memberships.filter(
      (membership) => membership.contextType === updatedType && membership.archived === archived,
    );

    const lastOrderMembership = relevantMemberships.sort((a, b) => b.displayOrder - a.displayOrder)[0];

    const ceilOrder = lastOrderMembership ? Math.ceil(lastOrderMembership.displayOrder) : 0;

    orderToUpdate = ceilOrder + 10;
  }

  const values = {
    ...(role !== undefined && { role }),
    ...(orderToUpdate !== undefined && { displayOrder: orderToUpdate }),
    ...(muted !== undefined && { muted }),
    ...(archived !== undefined && { archived }),
    updatedBy: user.id,
    updatedAt: getIsoDate(),
  };
  const updatedMembership = await updateMembership(ctx, { id: membershipId, values });

  invalidateCache.user(updatedMembership.userId);

  // Event emitted via CDC -> activities table -> activityBus ('membership.updated')
  logEvent(ctx, 'info', 'Membership updated', { userId: updatedMembership.userId, membershipId: updatedMembership.id });

  return ctx.json(updatedMembership, 200);
});

/**
 * Accept - or reject - organization membership invitation
 */
app.openapi(membershipRoutes.handleMembershipInvitation, async (ctx) => {
  const { id: inactiveMembershipId, acceptOrReject } = ctx.req.valid('param');

  // crossTenantGuard sets user RLS context, so select_own_policy allows reading own invitation
  const inactiveMembership = await findInactiveMembershipForUser(ctx, { id: inactiveMembershipId });

  if (!inactiveMembership)
    throw new AppError(404, 'inactive_membership_not_found', 'error', { meta: { id: inactiveMembershipId } });

  // Build a minimal entity object from the inactive_membership row (avoids org table SELECT which requires membership)
  const entityFieldId = inactiveMembership.contextId;

  // Wrap write operations in a transaction for atomicity
  await baseDb.transaction(async (tx) => {
    if (acceptOrReject === 'accept') {
      // Internal resolve: user is accepting their own invitation, so no membership exists yet for permission checks
      const entity = await resolveEntity(tx, inactiveMembership.contextType, entityFieldId);
      if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: inactiveMembership.contextType });

      const activatedMemberships = await insertMemberships(
        tx,
        [{ entity, userId: ctx.var.user.id, role: inactiveMembership.role, createdBy: inactiveMembership.createdBy }],
        ctx,
      );

      await tx.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

      // Event emitted via CDC -> activities table -> activityBus ('membership.created')
      logEvent(ctx, 'info', 'Membership accepted', { ids: activatedMemberships.map((m) => m.id) });
    }

    // Reject membership simply marks it as rejected
    if (acceptOrReject === 'reject') {
      await tx
        .update(inactiveMembershipsTable)
        .set({ rejectedAt: getIsoDate() })
        .where(and(eq(inactiveMembershipsTable.id, inactiveMembership.id)));
    }
  });

  // After accept, user now has a membership — resolveEntity works directly
  const rootEntityId = inactiveMembership.organizationId;
  if (!rootEntityId) throw new AppError(500, 'server_error', 'error', { entityType: rootContextType });

  const entity = await resolveEntity(baseDb, rootContextType, rootEntityId);
  if (!entity) throw new AppError(404, 'not_found', 'error', { entityType: rootContextType });

  return ctx.json(entity, 200);
});

/**
 * Get members by entity id/slug and type
 */
app.openapi(membershipRoutes.getMembers, async (ctx) => {
  const db = ctx.var.db;
  const organization = ctx.var.organization;

  const { entityId, entityType, q, sort, order, offset, limit, role, userIds } = ctx.req.valid('query');

  // Validate entity existence and check read permission
  const { entity } = await getValidContextEntity(ctx, entityId, entityType, 'read');

  // Build search filters
  const $or = q
    ? [ilike(usersTable.name, prepareStringForILikeFilter(q)), ilike(usersTable.email, prepareStringForILikeFilter(q))]
    : [];

  const membersFilters = [
    eq(membershipsTable.organizationId, organization.id),
    eq(membershipsTable.contextId, entity.id),
    eq(membershipsTable.contextType, entityType),
  ];

  if (role) membersFilters.push(eq(membershipsTable.role, role));
  if (userIds) membersFilters.push(inArray(usersTable.id, userIds.split(',')));

  const orderColumn = getOrderColumn(sort, usersTable.id, order, {
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    createdAt: usersTable.createdAt,
    lastSeenAt: sql`(SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
    role: membershipsTable.role,
  });

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
});

/**
 * Get pending memberships by entity id/slug and type.
 */
app.openapi(membershipRoutes.getPendingMemberships, async (ctx) => {
  const db = ctx.var.db;
  const organization = ctx.var.organization;

  const { entityId, entityType, sort, order, offset, limit } = ctx.req.valid('query');
  const { entity } = await getValidContextEntity(ctx, entityId, entityType, 'read');

  const table = inactiveMembershipsTable;
  const orderColumn = getOrderColumn(sort, table.createdAt, order, { createdAt: table.createdAt });

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
    .where(and(eq(table.contextId, entity.id), eq(table.organizationId, organization.id)))
    .orderBy(orderColumn);

  const rawItems = await pendingMembershipsQuery.limit(limit).offset(offset);

  // Populate createdBy with user objects
  const items = await withAuditUsers(ctx, rawItems);

  const [{ total }] = await db.select({ total: count() }).from(pendingMembershipsQuery.as('pendingMemberships'));

  return ctx.json({ items, total }, 200);
});

export { membershipTag } from '#/modules/memberships/memberships-module';
export const membershipHandlers = app;
