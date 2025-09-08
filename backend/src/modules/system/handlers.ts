import { db } from '#/db/db';
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
import { getSignedUrl } from '#/lib/signed-url';
import systemRoutes from '#/modules/system/routes';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { defaultHook } from '#/utils/default-hook';
import { logError, logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { OpenAPIHono } from '@hono/zod-openapi';
import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { appConfig } from 'config';
import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import i18n from 'i18next';
import { NewsletterEmail, type NewsletterEmailProps } from '../../../emails/newsletter';
import { SystemInviteEmail, type SystemInviteEmailProps } from '../../../emails/system-invite';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new OpenAPIHono<Env>({ defaultHook });

const systemRouteHandlers = app
  /*
   * Invite users to system
   */
  .openapi(systemRoutes.createInvite, async (ctx) => {
    const { emails } = ctx.req.valid('json');
    const user = getContextUser();

    const lng = user.language;
    const senderName = user.name;
    const senderThumbnailUrl = user.thumbnailUrl;
    const subject = i18n.t('backend:email.system_invite.subject', { lng, appName: appConfig.name });

    const normalizedEmails = emails.map((email) => email.toLowerCase().trim());

    if (!normalizedEmails.length) throw new AppError({ status: 400, type: 'no_recipients', severity: 'warn' });

    // Query to filter out invitations on same email
    const existingInvitesQuery = db
      .select()
      .from(tokensTable)
      .where(
        and(
          inArray(tokensTable.email, normalizedEmails),
          eq(tokensTable.type, 'invitation'),
          // Make sure its a system invitation
          isNull(tokensTable.entityType),
          lt(tokensTable.expiresAt, new Date()),
          isNull(tokensTable.consumedAt),
        ),
      );

    const existingUsersQuery = await usersBaseQuery().where(inArray(emailsTable.email, normalizedEmails));

    const [existingUsers, existingInvites] = await Promise.all([existingUsersQuery, existingInvitesQuery]);

    // Create a set of emails from both existing users and invitations
    const existingEmails = new Set([...existingUsers.map((user) => user.email), ...existingInvites.map((invite) => invite.email)]);

    // Filter out emails that already user or has invitations
    const recipientEmails = normalizedEmails.filter((email) => !existingEmails.has(email));
    const rejectedItems = normalizedEmails.filter((email) => existingEmails.has(email));

    // Stop if no recipients
    if (recipientEmails.length === 0) return ctx.json({ success: false, rejectedItems, invitesSentCount: 0 }, 200);

    // Generate tokens
    const tokens = recipientEmails.map((email) => {
      const token = nanoid(40);
      return {
        token,
        type: 'invitation' as const,
        email: email.toLowerCase().trim(),
        createdBy: user.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      };
    });

    // Batch insert tokens
    const insertedTokens = await db.insert(tokensTable).values(tokens).returning();

    // Change waitlist request status
    await Promise.all(
      insertedTokens.map((token) =>
        db
          .update(requestsTable)
          .set({ tokenId: token.id })
          .where(and(eq(requestsTable.email, token.email), eq(requestsTable.type, 'waitlist'))),
      ),
    );

    // Prepare emails
    const recipients = insertedTokens.map((tokenRecord) => ({
      email: tokenRecord.email,
      lng: lng,
      name: slugFromEmail(tokenRecord.email),
      systemInviteLink: `${appConfig.frontendUrl}/auth/authenticate?token=${tokenRecord.token}`,
    }));

    type Recipient = (typeof recipients)[number];

    // Send invitation
    const staticProps = { senderName, senderThumbnailUrl, subject, lng };
    await mailer.prepareEmails<SystemInviteEmailProps, Recipient>(SystemInviteEmail, staticProps, recipients, user.email);

    logEvent('info', 'Users invited on system level', { count: recipients.length });

    return ctx.json({ success: true, rejectedItems, invitesSentCount: recipients.length }, 200);
  })
  /*
   * Get presigned URL
   */
  .openapi(systemRoutes.getPresignedUrl, async (ctx) => {
    const { key } = ctx.req.valid('query');

    const url = await getSignedUrl(key);

    return ctx.json(url, 200);
  })
  /*
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
  /*
   * Send newsletter to members of one or more organizations matching one ore more roles.
   */
  .openapi(systemRoutes.sendNewsletter, async (ctx) => {
    const { organizationIds, subject, content, roles } = ctx.req.valid('json');
    const { toSelf } = ctx.req.valid('query');

    const user = getContextUser();

    // Get members from organizations
    // TODO(REFACTOR) using emails table
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

    type Recipient = (typeof recipients)[number];

    // Prepare emails and send them
    const staticProps = { content, subject, testEmail: toSelf, lng: user.language };
    await mailer.prepareEmails<NewsletterEmailProps, Recipient>(NewsletterEmail, staticProps, recipients, user.email);

    logEvent('info', 'Newsletter sent', { count: recipients.length });

    return ctx.json(true, 200);
  });

export default systemRouteHandlers;
