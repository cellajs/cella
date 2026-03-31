import { OpenAPIHono } from '@hono/zod-openapi';
import i18n from 'i18next';
import { appConfig } from 'shared';
import { nanoid } from 'shared/nanoid';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { mailer } from '#/lib/mailer';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { replaceSignedSrcs } from '#/modules/system/helpers/get-signed-src';
import {
  deleteUsersByIds,
  findNewsletterRecipients,
  findPendingInvitationTokens,
  findUserById,
  findUsersByIds,
  findVerifiedEmails,
  insertTokens,
  linkWaitlistRequest,
  updateUser,
} from '#/modules/system/system-queries';
import systemRoutes from '#/modules/system/system-routes';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { NewsletterEmail, SystemInviteEmail } from '../../../emails';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Invite users to system by list of email addresses. There are some scenarios:
 * 1. email doesn't exist in emailsTable AND not in tokensTable (so no pending invitation) -> add to recipients list and create invitation token.
 * 2. email doesn't exist in emailsTable BUT does exist in tokensTable (so pending invitation already) -> if token is expired, add to recipients,
 * remove the old token and create a new one.
 * 3. email exists in emailsTable AND in tokensTable -> remove from recipients.
 */
app.openapi(systemRoutes.createInvite, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  const { emails } = ctx.req.valid('json');

  const lng = user.language;
  const senderName = user.name;
  const senderThumbnailUrl = user.thumbnailUrl;
  const subject = i18n.t('backend:email.system_invite.subject', { lng, appName: appConfig.name });

  // Normalize + de-dupe
  const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
  if (normalizedEmails.length === 0) throw new AppError(400, 'no_recipients', 'warn');

  const now = new Date();

  // 1) Emails that already belong to a verified user (users can have multiple emails)
  const existingEmailRecords = await findVerifiedEmails(db, { emails: normalizedEmails });

  const existingEmails = new Set(existingEmailRecords.map((r) => r.email));

  // 2) Pending invitation tokens for normalized emails
  const pendingTokens = await findPendingInvitationTokens(db, { emails: normalizedEmails });

  // Index tokens per email, classify active vs expired
  const activeTokenByEmail = new Map<string, { id: string }>();
  const expiredTokenIdsByEmail = new Map<string, string[]>();

  for (const t of pendingTokens) {
    const isActive = new Date(t.expiresAt) > now;
    if (isActive) activeTokenByEmail.set(t.email, { id: t.id });
    else {
      const arr = expiredTokenIdsByEmail.get(t.email) ?? [];
      arr.push(t.id);
      expiredTokenIdsByEmail.set(t.email, arr);
    }
  }

  // 3) Decide recipients vs rejected based on scenarios
  const recipientEmails: string[] = [];
  const rejectedIds: string[] = [];

  for (const email of normalizedEmails) {
    if (existingEmails.has(email)) {
      // Already a user
      rejectedIds.push(email);
      continue;
    }

    if (activeTokenByEmail.has(email)) {
      // Already has an active pending invite
      rejectedIds.push(email);
      continue;
    }

    // Either no token at all OR expired token(s)
    recipientEmails.push(email);
  }

  if (recipientEmails.length === 0) {
    return ctx.json({ data: [] as never[], rejectedIds, invitesSentCount: 0 }, 200);
  }

  // Generate token and store hashed
  const newToken = nanoid(40);
  const hashedToken = encodeLowerCased(newToken);

  // 5) Create new tokens for recipients
  const tokens = recipientEmails.map((email) => ({
    secret: hashedToken,
    type: 'invitation' as const,
    email,
    createdBy: user.id,
    expiresAt: createDate(new TimeSpan(7, 'd')),
  }));

  const insertedTokens = await insertTokens(db, tokens);

  // 6) Link waitlist requests (if any)
  await Promise.all(insertedTokens.map((t) => linkWaitlistRequest(db, { email: t.email, tokenId: t.id })));

  // 7) Prepare & send emails
  const recipients = insertedTokens.map(({ email, type }) => ({
    email,
    lng,
    name: slugFromEmail(email),
    inviteLink: `${appConfig.backendAuthUrl}/invoke-token/${type}/${newToken}`,
  }));

  const staticProps = { senderName, senderThumbnailUrl, subject, lng };
  await mailer.prepareEmails(SystemInviteEmail, staticProps, recipients, user.email);

  logEvent(ctx, 'info', 'Users invited on system level', { count: recipients.length });

  return ctx.json({ data: [] as never[], rejectedIds, invitesSentCount: recipients.length }, 200);
});

/**
 * Delete users (system admin only)
 */
app.openapi(systemRoutes.deleteUsers, async (ctx) => {
  const db = ctx.var.db;
  const { ids } = ctx.req.valid('json');

  // Convert the user ids to an array
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  // Fetch users by IDs to verify they exist
  const targets = await findUsersByIds(db, { ids: toDeleteIds });

  const foundIds = targets.map(({ id }) => id);
  const rejectedIds = toDeleteIds.filter((id) => !foundIds.includes(id));

  // If no valid users found, return error
  if (!foundIds.length) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  // Delete users — CASCADE SET NULL on createdBy/updatedBy propagates to product entities
  await deleteUsersByIds(db, { ids: foundIds });

  for (const id of foundIds) invalidateCache.user(id);
  logEvent(ctx, 'info', 'Users deleted', { count: foundIds.length, ids: foundIds });

  return ctx.json({ data: [] as never[], rejectedIds }, 200);
});

/**
 * Update a user by id
 */
app.openapi(systemRoutes.updateUser, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  const { id } = ctx.req.valid('param');

  const targetUser = await findUserById(db, { id });

  if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: id } });

  const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

  // Check if slug is available
  if (slug && slug !== targetUser.slug) {
    const slugAvailable = await checkSlugAvailable(db, slug, 'user');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
  }

  const values = {
    bannerUrl,
    firstName,
    lastName,
    language,
    newsletter,
    thumbnailUrl,
    slug,
    name: [firstName, lastName].filter(Boolean).join(' ') || slug,
    updatedAt: getIsoDate(),
    updatedBy: user.id,
  };
  const updatedUser = await updateUser(db, { id: targetUser.id, values });

  invalidateCache.user(updatedUser.id);
  logEvent(ctx, 'info', 'User updated', { userId: updatedUser.id });

  // Re-select with userSelect to include timestamps (subqueries from user_counters table)
  const userWithActivity = await findUserById(db, { id: updatedUser.id });

  return ctx.json(userWithActivity, 200);
});

/**
 * Send newsletter to members of one or more organizations matching one ore more roles.
 */
app.openapi(systemRoutes.sendNewsletter, async (ctx) => {
  const db = ctx.var.db;
  const user = ctx.var.user;

  const { organizationIds, subject, content, roles } = ctx.req.valid('json');
  const { toSelf } = ctx.req.valid('query');

  // Get members from organizations
  const recipientsRecords = await findNewsletterRecipients(db, { organizationIds, roles });

  // Stop if no recipients
  if (!recipientsRecords.length && !toSelf) throw new AppError(400, 'no_recipients', 'warn');

  // Add unsubscribe link to each recipient
  let recipients = recipientsRecords.map(({ newsletter, unsubscribeToken, ...recipient }) => ({
    ...recipient,
    unsubscribeLink: `${appConfig.backendUrl}/unsubscribe?token=${unsubscribeToken}`,
  }));

  // If toSelf is true, send the email only to self
  if (toSelf)
    recipients = [
      {
        email: user.email,
        name: user.name,
        unsubscribeLink: `${appConfig.backendUrl}/unsubscribe?token=NOTOKEN`,
        orgName: 'TEST EMAIL ORGANIZATION',
      },
    ];

  // Replace all src attributes in content
  const newContent = await replaceSignedSrcs(content);

  // Prepare emails and send them
  const staticProps = { content: newContent, subject, testEmail: toSelf, lng: user.language };
  await mailer.prepareEmails(NewsletterEmail, staticProps, recipients, user.email);

  logEvent(ctx, 'info', 'Newsletter sent', { count: recipients.length });

  return ctx.body(null, 204);
});

export { systemTag } from '#/modules/system/system-module';
export const systemHandlers = app;
