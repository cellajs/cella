import { appConfig, type ChannelEntityType, type EntityRole, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { getMembershipEntityIds, insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import {
  countMembershipsByChannel,
  countPendingInvitesByChannel,
  findMembershipAwareRows,
  insertInactiveMemberships,
  insertTokens,
  stampInactiveMembershipsReminded,
} from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { memberAddedEmail, memberInviteEmail, memberInviteWithTokenEmail } from '../../../../emails';

const rootChannelType = hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null)!;

interface CreateMembershipsInput {
  emails: string[];
  role: EntityRole;
  entityId: string;
  entityType: ChannelEntityType;
}

export async function createMembershipsOp(ctx: AuthContext, input: CreateMembershipsInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const organization = ctx.var.organization;

  const { emails, role, entityId, entityType } = input;

  const normalizedEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))];
  if (!normalizedEmails.length) throw new AppError(400, 'no_recipients', 'warn');

  // The invited role must exist in the target context's vocabulary (e.g. no org 'member' on a course)
  if (!hierarchy.getRoles(entityType).includes(role)) {
    throw new AppError(400, 'invalid_role', 'warn', { entityType });
  }

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'update');

  const { slug: entitySlug, name: entityName } = entity;

  /**
   * Draft context (publishedAt null): invites are recorded (inactive memberships + tokens)
   * but email dispatch is held and existing users are not added directly. Everything is
   * released when the context is published. The context's most-privileged role (first in
   * its vocabulary, e.g. admin/staff/owner) stays live so staff can collaborate in drafts.
   */
  const channelIsDraft = entity.publishedAt === null;
  const deferDispatch = channelIsDraft && role !== hierarchy.getRoles(entityType)[0];

  const currentOrgMemberships = await countMembershipsByChannel(ctx, {
    channelType: rootChannelType,
    channelId: organization.id,
  });
  const pendingInvites = await countPendingInvitesByChannel(ctx, {
    channelType: rootChannelType,
    channelId: organization.id,
  });

  const membersRestrictions = ctx.var.tenant.restrictions.quotas.user;
  if (
    membersRestrictions !== 0 &&
    currentOrgMemberships + pendingInvites + normalizedEmails.length > membersRestrictions
  ) {
    throw new AppError(403, 'restrict_by_org', 'warn', { entityType });
  }

  const rejectedIds: string[] = [];
  const reminderEmails: string[] = [];
  const existingUsersToActivate: Array<{ userId: string; email: string }> = [];
  const existingUsersToDirectAdd: Array<{ userId: string; email: string }> = [];
  const newUserTokenEmails: string[] = [];

  const inactiveMembershipsToInsert: Parameters<typeof insertInactiveMemberships>[1]['memberships'] = [];

  const lng = appConfig.defaultLanguage;
  const senderName = user.name;
  const senderThumbnailUrl = user.thumbnailUrl;

  const membershipAwareRows = await findMembershipAwareRows(ctx, {
    emails: normalizedEmails,
    entityType,
    entityId: entity.id,
  });

  type MembershipAwareRow = (typeof membershipAwareRows)[number];
  const rowsByEmail = new Map<string, MembershipAwareRow[]>();
  for (const e of normalizedEmails) rowsByEmail.set(e, []);
  for (const r of membershipAwareRows) rowsByEmail.get(r.email)?.push(r);

  // Reminder throttle: a pending invite is re-emailed at most once per 7 days
  const reminderThrottleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const remindedInactiveMembershipIds: string[] = [];

  for (const email of normalizedEmails) {
    const rows = rowsByEmail.get(email)!;

    const hasActiveMembership = rows.some((r) => r.membershipId);
    const hasUserInactiveMembership = rows.some((r) => r.inactiveMembershipId);
    const hasTokenInvite = rows.some((r) => r.tokenId);

    if (hasActiveMembership) {
      rejectedIds.push(email);
      continue;
    }

    if (hasUserInactiveMembership || hasTokenInvite) {
      // No reminders against a draft context; otherwise throttle on last dispatch
      const inactiveRow = rows.find((r) => r.inactiveMembershipId);
      const lastDispatch = inactiveRow?.inactiveMembershipRemindedAt ?? inactiveRow?.inactiveMembershipCreatedAt;
      const throttled = !!lastDispatch && new Date(lastDispatch) >= reminderThrottleBefore;

      if (!deferDispatch && !throttled) {
        reminderEmails.push(email);
        if (inactiveRow?.inactiveMembershipId) remindedInactiveMembershipIds.push(inactiveRow.inactiveMembershipId);
      }
      continue;
    }

    const userRow = rows.find((r) => r.userId);
    if (userRow?.userId) {
      const isAdminInvitingSelf = user.email === email && isSystemAdmin;

      if (isAdminInvitingSelf) {
        existingUsersToDirectAdd.push({ userId: userRow.userId, email });
      } else {
        const hasActiveOrgMembership = entityType !== rootChannelType && !!rows.find((r) => r.orgMembershipId);

        // Draft context: existing users are deferred too, with no membership, nav entry, or email.
        if (hasActiveOrgMembership && !deferDispatch) {
          existingUsersToDirectAdd.push({ userId: userRow.userId, email });
        } else {
          existingUsersToActivate.push({ userId: userRow.userId, email });
        }
      }
      continue;
    }

    newUserTokenEmails.push(email);
  }

  if (existingUsersToActivate.length > 0) {
    const inactiveMembershipsForExistingUsers = existingUsersToActivate.map(({ userId, email }) => ({
      email,
      userId,
      role,
      entity,
      createdBy: user.id,
      channelType: entityType,
      tenantId: ctx.var.tenantId,
      ...getMembershipEntityIds(entity),
      channelId: entity.id,
    }));

    inactiveMembershipsToInsert.push(...inactiveMembershipsForExistingUsers);
  }

  let createdMemberships: Awaited<ReturnType<typeof insertMemberships>> = [];
  if (existingUsersToDirectAdd.length > 0) {
    const membershipsToInsert = existingUsersToDirectAdd.map(({ userId }) => ({
      userId,
      role,
      entity: { ...entity, tenantId: ctx.var.tenantId },
      createdBy: user.id,
    }));

    createdMemberships = await insertMemberships({ var: { db } }, { items: membershipsToInsert });
    for (const { userId } of existingUsersToDirectAdd) invalidateCache.user(userId);
  }

  const memberInviteNoTokenLink = `${appConfig.frontendUrl}/${entityType}/${entitySlug}`;

  const noTokenRecipients = [
    ...existingUsersToActivate.map(({ email }) => {
      return { email, lng, name: slugFromEmail(email), memberInviteLink: memberInviteNoTokenLink };
    }),
    ...reminderEmails.map((email) => {
      return { email, lng, name: slugFromEmail(email), memberInviteLink: memberInviteNoTokenLink };
    }),
  ];

  const newUserInactiveMembershipIdsByEmail = new Map<string, string>();
  for (const email of newUserTokenEmails) newUserInactiveMembershipIdsByEmail.set(email, generateId());

  const rawTokens: Array<{ email: string; raw: string }> = [];
  const tokensToInsert = newUserTokenEmails.map((email) => {
    const raw = nanoid(40);
    const hashed = hashToken(raw);
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
      ...getMembershipEntityIds(entity),
      channelId: entity.id,
    };
  });

  let insertedTokens: Array<{ id: string; email: string; secret: string; type: string }> = [];
  if (tokensToInsert.length > 0) {
    insertedTokens = await insertTokens(ctx, { tokens: tokensToInsert });
  }

  let insertedInactiveMemberships: Array<{ id: string; email: string }> = [];

  if (newUserTokenEmails.length > 0 && insertedTokens.length > 0) {
    const tokensByEmail = new Map(insertedTokens.map((t) => [t.email, t.id]));

    const newUserInactiveMemberships = newUserTokenEmails.map((email) => ({
      id: newUserInactiveMembershipIdsByEmail.get(email)!,
      email,
      role,
      entity,
      createdBy: user.id,
      channelType: entityType,
      tokenId: tokensByEmail.get(email)!,
      tenantId: ctx.var.tenantId,
      ...getMembershipEntityIds(entity),
      channelId: entity.id,
    }));

    inactiveMembershipsToInsert.push(...newUserInactiveMemberships);
  }

  if (inactiveMembershipsToInsert.length > 0) {
    insertedInactiveMemberships = await insertInactiveMemberships(ctx, {
      memberships: inactiveMembershipsToInsert,
    });
  }

  const rawByEmail = new Map(rawTokens.map((t) => [t.email, t.raw]));

  const withTokenRecipients = insertedTokens
    .filter(({ email }) => insertedInactiveMemberships.some((m) => m.email === email))
    .map(({ email, type }) => {
      const rawToken = rawByEmail.get(email)!;
      const inviteLink = `${appConfig.backendAuthUrl}/invoke-token/${type}/${rawToken}`;

      return { email, lng, name: slugFromEmail(email), inviteLink };
    });

  const staticProps = { senderName, senderThumbnailUrl, role, entityName };

  // Draft context: hold every email until deferred invites are dispatched at publish time.
  if (!deferDispatch && noTokenRecipients.length > 0) {
    await mailer.prepareEmails(memberInviteEmail, staticProps, noTokenRecipients, user.email);
  }

  const entityLink = `${appConfig.frontendUrl}/${entityType}/${entitySlug}`;
  const directAdditionRecipients = existingUsersToDirectAdd.map(({ email }) => ({
    email,
    lng,
    name: slugFromEmail(email),
    entityLink,
  }));

  if (!deferDispatch && directAdditionRecipients.length > 0) {
    await mailer.prepareEmails(memberAddedEmail, staticProps, directAdditionRecipients, user.email);
  }

  if (!deferDispatch && withTokenRecipients.length > 0) {
    await mailer.prepareEmails(memberInviteWithTokenEmail, staticProps, withTokenRecipients, user.email);
  }

  // Track reminder dispatch for the 7-day throttle
  if (!deferDispatch && remindedInactiveMembershipIds.length > 0) {
    await stampInactiveMembershipsReminded(ctx, {
      ids: remindedInactiveMembershipIds,
      remindedAt: new Date().toISOString(),
    });
  }

  const invitesSentCount = insertedInactiveMemberships.length;

  log.info('Users invited on entity level', {
    count: invitesSentCount,
    entityType,
    entityId,
  });

  return { data: createdMemberships, rejectedIds, invitesSentCount };
}
