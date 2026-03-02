import { OpenAPIHono } from '@hono/zod-openapi';
import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import i18n from 'i18next';
import { appConfig } from 'shared';
import { nanoid } from 'shared/nanoid';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { requestsTable } from '#/db/schema/requests';
import { tokensTable } from '#/db/schema/tokens';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { mailer } from '#/lib/mailer';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { replaceSignedSrcs } from '#/modules/system/helpers/get-signed-src';
import systemRoutes from '#/modules/system/system-routes';
import { userSelect } from '#/modules/user/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logError, logEvent } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { NewsletterEmail, SystemInviteEmail } from '../../../emails';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new OpenAPIHono<Env>({ defaultHook });

const systemRouteHandlers = app
  /**
   * Invite users to system by list of email addresses. There are some scenarios:
   * 1. email doesn't exist in emailsTable AND not in tokensTable (so no pending invitation) -> add to recipients list and create invitation token.
   * 2. email doesn't exist in emailsTable BUT does exist in tokensTable (so pending invitation already) -> if token is expired, add to recipients,
   * remove the old token and create a new one.
   * 3. email exists in emailsTable AND in tokensTable -> remove from recipients.
   */
  .openapi(systemRoutes.createInvite, async (ctx) => {
    const db = ctx.var.db;
    const { emails } = ctx.req.valid('json');
    const user = ctx.var.user;

    const lng = user.language;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.system_invite.subject', { lng, appName: appConfig.name });

    // Normalize + de-dupe
    const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
    if (normalizedEmails.length === 0) throw new AppError(400, 'no_recipients', 'warn');

    const now = new Date();

    // 1) Emails that already belong to a verified user (users can have multiple emails)
    const existingEmailRecords = await db
      .select({ email: emailsTable.email })
      .from(emailsTable)
      .where(and(inArray(emailsTable.email, normalizedEmails), eq(emailsTable.verified, true)));

    const existingEmails = new Set(existingEmailRecords.map((r) => r.email));

    // 2) Pending invitation tokens for normalized emails
    const pendingTokens = await db
      .select({
        id: tokensTable.id,
        email: tokensTable.email,
        expiresAt: tokensTable.expiresAt,
        invokedAt: tokensTable.invokedAt,
      })
      .from(tokensTable)
      .where(
        and(
          inArray(tokensTable.email, normalizedEmails),
          eq(tokensTable.type, 'invitation'),
          isNull(tokensTable.inactiveMembershipId), // system invite
          isNull(tokensTable.invokedAt), // pending (not used)
        ),
      );

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
    const rejectedItemIds: string[] = [];

    for (const email of normalizedEmails) {
      if (existingEmails.has(email)) {
        // Already a user
        rejectedItemIds.push(email);
        continue;
      }

      if (activeTokenByEmail.has(email)) {
        // Already has an active pending invite
        rejectedItemIds.push(email);
        continue;
      }

      // Either no token at all OR expired token(s)
      recipientEmails.push(email);
    }

    if (recipientEmails.length === 0) {
      return ctx.json({ data: [] as never[], rejectedItemIds, invitesSentCount: 0 }, 200);
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

    const insertedTokens = await db.insert(tokensTable).values(tokens).returning();

    // 6) Link waitlist requests (if any)
    await Promise.all(
      insertedTokens.map((t) =>
        db
          .update(requestsTable)
          .set({ tokenId: t.id })
          .where(and(eq(requestsTable.email, t.email), eq(requestsTable.type, 'waitlist'))),
      ),
    );

    // 7) Prepare & send emails
    const recipients = insertedTokens.map(({ email, type }) => ({
      email,
      lng,
      name: slugFromEmail(email),
      inviteLink: `${appConfig.backendAuthUrl}/invoke-token/${type}/${newToken}`,
    }));

    const staticProps = { senderName, senderThumbnailUrl, subject, lng };
    await mailer.prepareEmails(SystemInviteEmail, staticProps, recipients, user.email);

    logEvent('info', 'Users invited on system level', { count: recipients.length });

    return ctx.json({ data: [] as never[], rejectedItemIds, invitesSentCount: recipients.length }, 200);
  })
  /**
   * Delete users (system admin only)
   */
  .openapi(systemRoutes.deleteUsers, async (ctx) => {
    const db = ctx.var.db;
    const { ids } = ctx.req.valid('json');

    // Convert the user ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    // Fetch users by IDs to verify they exist
    const targets = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, toDeleteIds));

    const foundIds = targets.map(({ id }) => id);
    const rejectedItemIds = toDeleteIds.filter((id) => !foundIds.includes(id));

    // If no valid users found, return error
    if (!foundIds.length) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

    // Delete users
    await db.delete(usersTable).where(inArray(usersTable.id, foundIds));

    logEvent('info', 'Users deleted', foundIds);

    return ctx.json({ data: [] as never[], rejectedItemIds }, 200);
  })
  /**
   * Update a user by id
   */
  .openapi(systemRoutes.updateUser, async (ctx) => {
    const db = ctx.var.db;
    const { id } = ctx.req.valid('param');

    const user = ctx.var.user;

    const [targetUser] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, id)).limit(1);

    if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: id } });

    const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = ctx.req.valid('json');

    // Check if slug is available
    if (slug && slug !== targetUser.slug) {
      const slugAvailable = await checkSlugAvailable(slug, db);
      if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({
        bannerUrl,
        firstName,
        lastName,
        language,
        newsletter,
        thumbnailUrl,
        slug,
        name: [firstName, lastName].filter(Boolean).join(' ') || slug,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(usersTable.id, targetUser.id))
      .returning();

    logEvent('info', 'User updated', { userId: updatedUser.id });

    // Re-select with userSelect to include activity timestamps (subqueries from user_activity table)
    const [userWithActivity] = await db
      .select(userSelect)
      .from(usersTable)
      .where(eq(usersTable.id, updatedUser.id))
      .limit(1);

    return ctx.json(userWithActivity, 200);
  })
  /**
   * Paddle webhook
   */
  .openapi(systemRoutes.paddleWebhook, async (ctx) => {
    const signature = ctx.req.header('paddle-signature');
    const rawRequestBody = String(ctx.req.raw.body);

    try {
      if (signature && rawRequestBody) {
        const eventData = paddle.webhooks.unmarshal(rawRequestBody, env.PADDLE_WEBHOOK_KEY || '', signature);
        switch ((await eventData)?.eventType) {
          case EventName.SubscriptionCreated:
            logEvent('info', `Subscription ${(await eventData)?.data.id} was created`, { eventData });
            break;
          default:
            logEvent('warn', 'Unhandled paddle event', { eventData });
        }
      }
    } catch (error) {
      logError('Error handling paddle webhook', error);
    }

    return ctx.body(null, 204);
  })
  /**
   * Send newsletter to members of one or more organizations matching one ore more roles.
   */
  .openapi(systemRoutes.sendNewsletter, async (ctx) => {
    const db = ctx.var.db;
    const { organizationIds, subject, content, roles } = ctx.req.valid('json');
    const { toSelf } = ctx.req.valid('query');

    const user = ctx.var.user;

    // Get members from organizations
    const recipientsRecords = await db
      .selectDistinct({
        email: usersTable.email,
        name: usersTable.name,
        unsubscribeToken: unsubscribeTokensTable.secret,
        newsletter: usersTable.newsletter,
        orgName: organizationsTable.name,
      })
      .from(membershipsTable)
      .innerJoin(usersTable, and(eq(usersTable.id, membershipsTable.userId)))
      .innerJoin(unsubscribeTokensTable, and(eq(usersTable.id, unsubscribeTokensTable.userId)))
      .innerJoin(organizationsTable, eq(organizationsTable.id, membershipsTable.organizationId))
      .where(
        and(
          eq(membershipsTable.contextType, 'organization'),
          inArray(membershipsTable.organizationId, organizationIds),
          inArray(membershipsTable.role, roles),
          eq(usersTable.newsletter, true),
        ),
      );

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

    logEvent('info', 'Newsletter sent', { count: recipients.length });

    return ctx.body(null, 204);
  });

export default systemRouteHandlers;
