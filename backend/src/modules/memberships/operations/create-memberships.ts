import { appConfig, type ContextEntityType, type EntityRole, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { getBaseMembershipEntityId, insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import {
  countMembershipsByContext,
  countPendingInvitesByContext,
  findMembershipAwareRows,
  insertInactiveMemberships,
  insertTokens,
} from '#/modules/memberships/memberships-queries';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { log } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { memberAddedEmail, memberInviteEmail, memberInviteWithTokenEmail } from '../../../../emails';

const rootContextType = hierarchy.contextTypes.find((t) => hierarchy.getParent(t) === null)!;

interface CreateMembershipsInput {
  emails: string[];
  role: EntityRole;
  entityId: string;
  entityType: ContextEntityType;
}

export async function createMembershipsOp(ctx: AuthContext, input: CreateMembershipsInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const organization = ctx.var.organization;

  const { emails, role, entityId, entityType } = input;

  const normalizedEmails = [...new Set(emails.map((e: string) => e.toLowerCase().trim()))];
  if (!normalizedEmails.length) throw new AppError(400, 'no_recipients', 'warn');

  const { entity } = await getValidContextEntity(ctx, entityId, entityType, 'update');

  const { slug: entitySlug, name: entityName } = entity;

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
      reminderEmails.push(email);
      continue;
    }

    const userRow = rows.find((r) => r.userId);
    if (userRow?.userId) {
      const isAdminInvitingSelf = user.email === email && isSystemAdmin;

      if (isAdminInvitingSelf) {
        existingUsersToDirectAdd.push({ userId: userRow.userId, email });
      } else {
        const hasActiveOrgMembership = entityType !== rootContextType && !!rows.find((r) => r.orgMembershipId);

        if (hasActiveOrgMembership) {
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
      contextType: entityType,
      tenantId: ctx.var.tenantId,
      ...getBaseMembershipEntityId(entity),
      contextId: entity.id,
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
      contextType: entityType,
      tokenId: tokensByEmail.get(email)!,
      tenantId: ctx.var.tenantId,
      ...getBaseMembershipEntityId(entity),
      contextId: entity.id,
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

  if (noTokenRecipients.length > 0) {
    await mailer.prepareEmails(memberInviteEmail, staticProps, noTokenRecipients, user.email);
  }

  const entityLink = `${appConfig.frontendUrl}/${entityType}/${entitySlug}`;
  const directAdditionRecipients = existingUsersToDirectAdd.map(({ email }) => ({
    email,
    lng,
    name: slugFromEmail(email),
    entityLink,
  }));

  if (directAdditionRecipients.length > 0) {
    await mailer.prepareEmails(memberAddedEmail, staticProps, directAdditionRecipients, user.email);
  }

  if (withTokenRecipients.length > 0) {
    await mailer.prepareEmails(memberInviteWithTokenEmail, staticProps, withTokenRecipients, user.email);
  }

  const invitesSentCount = insertedInactiveMemberships.length;

  log.info('Users invited on entity level', {
    count: invitesSentCount,
    entityType,
    entityId,
  });

  return { data: createdMemberships, rejectedIds, invitesSentCount };
}
