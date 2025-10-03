import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { requestsTable } from '#/db/schema/requests';
import { tokensTable } from '#/db/schema/tokens';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { getSignedUrlFromKey } from '#/lib/signed-url';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import systemRoutes from '#/modules/system/routes';
import permissionManager from '#/permissions/permissions-config';
import { defaultHook } from '#/utils/default-hook';
import { logError, logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { OpenAPIHono } from '@hono/zod-openapi';
import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { appConfig } from 'config';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import i18n from 'i18next';
import { NewsletterEmail, type NewsletterEmailProps } from '../../../emails/newsletter';
import { SystemInviteEmail, type SystemInviteEmailProps } from '../../../emails/system-invite';

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
    const { emails } = ctx.req.valid('json');
    const user = getContextUser();

    const lng = user.language;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.system_invite.subject', { lng, appName: appConfig.name });

    // Normalize + de-dupe
    const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
    if (normalizedEmails.length === 0) throw new AppError({ status: 400, type: 'no_recipients', severity: 'warn' });

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
          isNull(tokensTable.entityType), // system invite
          isNull(tokensTable.invokedAt), // pending (not used)
        ),
      );

    // Index tokens per email, classify active vs expired
    const activeTokenByEmail = new Map<string, { id: string }>();
    const expiredTokenIdsByEmail = new Map<string, string[]>();

    for (const t of pendingTokens) {
      const isActive = t.expiresAt > now;
      if (isActive) activeTokenByEmail.set(t.email, { id: t.id });
      else {
        const arr = expiredTokenIdsByEmail.get(t.email) ?? [];
        arr.push(t.id);
        expiredTokenIdsByEmail.set(t.email, arr);
      }
    }

    // 3) Decide recipients vs rejected based on scenarios
    const recipientEmails: string[] = [];
    const rejectedItems: string[] = [];

    for (const email of normalizedEmails) {
      if (existingEmails.has(email)) {
        // Already a user
        rejectedItems.push(email);
        continue;
      }

      if (activeTokenByEmail.has(email)) {
        // Already has an active pending invite
        rejectedItems.push(email);
        continue;
      }

      // Either no token at all OR expired token(s)
      recipientEmails.push(email);
    }

    if (recipientEmails.length === 0) {
      return ctx.json({ success: false, rejectedItems, invitesSentCount: 0 }, 200);
    }

    // 5) Create new tokens for recipients
    const tokens = recipientEmails.map((email) => ({
      token: nanoid(40),
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(7, 'd')),
      // entityType stays NULL => system-level
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
    const recipients = insertedTokens.map(({ email, token, type }) => ({
      email,
      lng,
      name: slugFromEmail(email),
      systemInviteLink: `${appConfig.backendAuthUrl}/invoke-token/${type}/${token}`,
    }));
    type Recipient = (typeof recipients)[number];

    const staticProps = { senderName, senderThumbnailUrl, subject, lng };
    await mailer.prepareEmails<SystemInviteEmailProps, Recipient>(SystemInviteEmail, staticProps, recipients, user.email);

    logEvent('info', 'Users invited on system level', { count: recipients.length });

    return ctx.json({ success: true, rejectedItems, invitesSentCount: recipients.length }, 200);
  })
  /**
   * Get presigned URL
   */
  .openapi(systemRoutes.getPresignedUrl, async (ctx) => {
    const { key, isPublic: queryPublic } = ctx.req.valid('query');

    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(or(eq(attachmentsTable.originalKey, key), eq(attachmentsTable.thumbnailKey, key), eq(attachmentsTable.convertedKey, key)))
      .limit(1);

    const { bucketName, public: isPublic } = attachment ?? {
      public: queryPublic,
      bucketName: queryPublic ? appConfig.s3PublicBucket : appConfig.s3PrivateBucket,
    };

    if (!isPublic) {
      // Get session id from cookie
      const { sessionToken } = await getParsedSessionCookie(ctx);
      const { user } = await validateSession(sessionToken);

      if (attachment) {
        const memberships = await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.userId, user.id), isNotNull(membershipsTable.activatedAt)));

        const isSystemAdmin = user.role === 'admin';
        const isAllowed = permissionManager.isPermissionAllowed(memberships, 'read', attachment);

        if (!isSystemAdmin || !isAllowed) throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType: attachment.entityType });
      }
    }

    const url = await getSignedUrlFromKey(key, { bucketName, isPublic });

    return ctx.json(url, 200);
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

    return ctx.json(true, 200);
  })
  /**
   * Send newsletter to members of one or more organizations matching one ore more roles.
   */
  .openapi(systemRoutes.sendNewsletter, async (ctx) => {
    const { organizationIds, subject, content, roles } = ctx.req.valid('json');
    const { toSelf } = ctx.req.valid('query');

    const user = getContextUser();

    // Get members from organizations
    const recipientsRecords = await db
      .selectDistinct({
        email: usersTable.email,
        name: usersTable.name,
        unsubscribeToken: unsubscribeTokensTable.token,
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
          isNotNull(membershipsTable.activatedAt),
          eq(usersTable.newsletter, true),
        ),
      );

    // Stop if no recipients
    if (!recipientsRecords.length && !toSelf) throw new AppError({ status: 400, type: 'no_recipients', severity: 'warn' });

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

    // Regex to match src="..." or src='...'
    // Captures quote type in g 1 and actual URL in g 2
    const srcRegex = /src\s*=\s*(['"])(.*?)\1/gi;

    const srcs = [...content.matchAll(srcRegex)].map(([_, src]) => src);

    // Map to hold original -> signed URL replacements
    const replacements = new Map<string, string>();

    // For each unique src, fetch its signed URL
    await Promise.all(
      srcs.map(async (src) => {
        try {
          const signed = await getSignedUrlFromKey(src, { isPublic: true, bucketName: appConfig.s3PublicBucket });
          replacements.set(src, signed);
        } catch (e) {
          replacements.set(src, src);
        }
      }),
    );

    // Replace all src attributes in content
    const newContent = content.replace(srcRegex, (_, quote, src) => `src=${quote}${replacements.get(src) ?? src}${quote}`);

    type Recipient = (typeof recipients)[number];

    // Prepare emails and send them
    const staticProps = { content: newContent, subject, testEmail: toSelf, lng: user.language };
    await mailer.prepareEmails<NewsletterEmailProps, Recipient>(NewsletterEmail, staticProps, recipients, user.email);

    logEvent('info', 'Newsletter sent', { count: recipients.length });

    return ctx.json(true, 200);
  });

export default systemRouteHandlers;
