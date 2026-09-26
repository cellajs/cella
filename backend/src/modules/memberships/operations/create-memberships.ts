import { appConfig, type ChannelEntityType, type EntityRole, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { getMembershipEntityIds, insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
import {
  countMembershipsByChannel,
  countPendingInvitesByChannel,
  findInvitationAccounts,
  findInvitationsToAddresses,
  insertInactiveMemberships,
  stampInactiveMembershipsReminded,
} from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { memberAddedEmail, memberInviteEmail, memberInviteWithTokenEmail } from '../../../../emails';

interface CreateMembershipsInput {
  emails: string[];
  role: EntityRole;
  entityId: string;
  entityType: ChannelEntityType;
}

export async function createMembershipsOp(ctx: UserContext, input: CreateMembershipsInput) {
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

  // Draft context (publishedAt null): invites are recorded but emails are held and existing users are not added, all released at publish.
  // The context's most-privileged role (first in its vocabulary) stays live so staff can collaborate in drafts.
  const channelIsDraft = entity.publishedAt === null;
  const deferDispatch = channelIsDraft && role !== hierarchy.getRoles(entityType)[0];

  const currentOrgMemberships = await countMembershipsByChannel(ctx, {
    channelType: 'organization',
    channelId: organization.id,
  });
  const pendingInvites = await countPendingInvitesByChannel(ctx, {
    channelType: 'organization',
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

  const [accounts, addressedInvitations] = await Promise.all([
    findInvitationAccounts(ctx, { emails: normalizedEmails, entityType, entityId: entity.id }),
    findInvitationsToAddresses(ctx, { emails: normalizedEmails, channelId: entity.id }),
  ]);
  const accountByEmail = new Map(accounts.map((account) => [account.email, account]));
  const invitationByEmail = new Map(addressedInvitations.map((invitation) => [invitation.email, invitation]));

  // Reminder throttle: a pending invite is re-emailed at most once per 7 days
  const reminderThrottleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const remindedInactiveMembershipIds: string[] = [];

  // Anyone may invite any address, so the answer rests only on what the inviter already sees: the channel's invitations
  // by address and its members by their listed (primary) address. An account behind an address picks the email and
  // whether a token is minted, never the answer.
  for (const email of normalizedEmails) {
    const invitation = invitationByEmail.get(email);
    const account = accountByEmail.get(email);

    if (invitation) {
      // A declined invitation is not sent again; a pending one gets a reminder, except against a draft context and
      // within the throttle.
      if (invitation.rejectedAt) continue;
      const throttled = new Date(invitation.remindedAt ?? invitation.createdAt) >= reminderThrottleBefore;
      if (!deferDispatch && !throttled) {
        reminderEmails.push(email);
        remindedInactiveMembershipIds.push(invitation.id);
      }
      continue;
    }

    const isListedAddress = account?.primaryEmail === email;

    if (account?.membershipId && isListedAddress) {
      rejectedIds.push(email);
      continue;
    }

    if (account) {
      const isAdminInvitingSelf = user.email === email && isSystemAdmin;
      // An organization member invited below the organization by their listed address joins at once. Draft context:
      // existing users are deferred too, with no membership, nav entry, or email.
      const joinsDirectly =
        entityType !== 'organization' && !!account.orgMembershipId && isListedAddress && !deferDispatch;

      if (isAdminInvitingSelf || joinsDirectly) existingUsersToDirectAdd.push({ userId: account.userId, email });
      else existingUsersToActivate.push({ userId: account.userId, email });
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

  const issuedTokens = await issueTokens(
    ctx,
    newUserTokenEmails.map((email) => ({
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      inactiveMembershipId: newUserInactiveMembershipIdsByEmail.get(email)!,
    })),
  );
  const insertedTokens = issuedTokens.map(({ token }) => token);

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

  const rawByEmail = new Map(issuedTokens.map(({ token, rawToken }) => [token.email, rawToken]));

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

  const data = createdMemberships.map((membership) => membershipAsSeenBy(membership, user.id));

  return { data, rejectedIds, invitesSentCount };
}
