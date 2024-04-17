import { and, eq, ilike, or } from 'drizzle-orm';
import { emailSender } from '../../../../email';
import { InviteEmail } from '../../../../email/emails/invite';

import { render } from '@react-email/render';
import { config } from 'config';
import { env } from 'env';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import jwt from 'jsonwebtoken';
import { type User, generateId } from 'lucia';
import { TimeSpan, createDate } from 'oslo';

import { db } from '../../db/db';

import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { sendSSE } from '../../lib/sse';
import auth from '../../middlewares/guard/auth';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { membershipSchema } from '../organizations/schema';
import { apiUserSchema } from '../users/schema';
import { checkSlugAvailable } from './helpers/check-slug';
import {
  checkSlugRouteConfig,
  checkTokenRouteConfig,
  getUploadTokenRouteConfig,
  inviteRouteConfig,
  paddleWebhookRouteConfig,
  suggestionsConfig,
} from './routes';
import { checkRole } from './helpers/check-role';

const paddle = new Paddle(env.PADDLE_API_KEY || '');

const app = new CustomHono();

export const streams = new Map<string, SSEStreamingApi>();

// * General endpoints
const generalRoutes = app
  /*
   * Get upload token
   */
  .openapi(getUploadTokenRouteConfig, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = ctx.get('user');
    // TODO: validate query param organization?
    const organizationId = ctx.req.query('organizationId');

    const sub = organizationId ? `${organizationId}/${user.id}` : user.id;

    const token = jwt.sign(
      {
        sub: sub,
        public: isPublic === 'true',
        imado: !!env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
      },
      env.TUS_UPLOAD_API_SECRET,
    );

    return ctx.json({
      success: true,
      data: token,
    });
  })
  /*
   * Check if slug is available
   */
  .openapi(checkSlugRouteConfig, async (ctx) => {
    const { slug } = ctx.req.valid('param');

    const slugAvailable = await checkSlugAvailable(slug);

    return ctx.json({
      success: true,
      data: slugAvailable,
    });
  })
  /*
   * Check token (token validation)
   */
  .openapi(checkTokenRouteConfig, async (ctx) => {
    const token = ctx.req.valid('param').token;

    // Check if token exists
    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, token)));
    if (!tokenRecord?.email) return errorResponse(ctx, 404, 'not_found', 'warn', 'token');

    // For reset token: check if token has valid user
    if (tokenRecord.type === 'PASSWORD_RESET') {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));
      if (!user) return errorResponse(ctx, 404, 'not_found', 'warn', 'user');
    }

    // For invitation token: check if user email is not already in the system
    if (tokenRecord.type === 'INVITATION' && !tokenRecord.organizationId) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));
      if (user) return errorResponse(ctx, 409, 'email_exists', 'error');
    }

    return ctx.json({
      success: true,
      data: tokenRecord.email,
    });
  })
  /*
   * Invite users to the system or members to an organization
   */
  .openapi(inviteRouteConfig, async (ctx) => {
    const { emails, role } = ctx.req.valid('json');
    const user = ctx.get('user');
    const organization = ctx.get('organization') as OrganizationModel | undefined;

    if (!organization && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn');
    }

    if (organization && !checkRole(membershipSchema, role)) {
      logEvent('Invalid role', { role }, 'warn');
      // t('common:error.invalid_role.text')
      return errorResponse(ctx, 400, 'invalid_role', 'warn');
    }

    if (role && organization && !membershipSchema.shape.role.safeParse(role).success) {
      logEvent('Invalid role', { role }, 'warn');
      // t('common:error.invalid_role.text')
      return errorResponse(ctx, 400, 'invalid_role', 'warn');
    }

    if (role && !organization && !apiUserSchema.shape.role.safeParse(role).success) {
      logEvent('Invalid role', { role }, 'warn');
      return errorResponse(ctx, 400, 'invalid_role', 'warn');
    }

    for (const email of emails) {
      const [targetUser] = (await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()))) as (User | undefined)[];

      if (targetUser && organization) {
        const [existingMembership] = await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)));

        if (existingMembership) {
          logEvent('User already member of organization', { user: targetUser.id, organization: organization.id });

          if (role && existingMembership.role !== role) {
            await db
              .update(membershipsTable)
              .set({ role: role as MembershipModel['role'] })
              .where(
                and(eq(membershipsTable.organizationId, existingMembership.organizationId), eq(membershipsTable.userId, existingMembership.userId)),
              );
            logEvent('User role updated', { user: targetUser.id, organization: organization.id, role });

            sendSSE(targetUser.id, 'update_organization', {
              ...organization,
              userRole: role,
            });
          }

          continue;
        }

        if (user.id === targetUser.id) {
          console.log('User is trying to invite themselves');
          await db
            .insert(membershipsTable)
            .values({
              organizationId: organization.id,
              userId: user.id,
              role: (role as MembershipModel['role']) || 'MEMBER',
              createdBy: user.id,
            })
            .returning();

          logEvent('User added to organization', { user: user.id, organization: organization.id });

          sendSSE(user.id, 'new_membership', {
            ...organization,
            userRole: role || 'MEMBER',
          });

          continue;
        }
      }

      const token = generateId(40);
      await db.insert(tokensTable).values({
        id: token,
        type: 'INVITATION',
        userId: targetUser?.id,
        email: email.toLowerCase(),
        role: role || 'USER',
        organizationId: organization?.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailLanguage = organization?.defaultLanguage || targetUser?.language || config.defaultLanguage;

      let emailHtml: string;

      if (!organization) {
        if (!targetUser) {
          emailHtml = render(
            InviteEmail({
              i18n: i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage }),
              username: email.toLowerCase(),
              inviteUrl: `${config.frontendUrl}/auth/accept-invite/${token}`,
              invitedBy: user.name,
              type: 'system',
              replyTo: user.email,
            }),
          );
          logEvent('User invited on system level');
        } else {
          logEvent('User already exists', { user: targetUser.id }, 'warn');
          continue;
        }
      } else {
        emailHtml = render(
          InviteEmail({
            i18n: i18n.cloneInstance({ lng: i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage }),
            orgName: organization.name || '',
            orgImage: organization.logoUrl || '',
            userImage: targetUser?.thumbnailUrl ? `${targetUser.thumbnailUrl}?width=100&format=avif` : '',
            username: targetUser?.name || email.toLowerCase() || '',
            invitedBy: user.name,
            inviteUrl: `${config.frontendUrl}/${organization.slug}/accept-invite/${token}`,
            replyTo: user.email,
          }),
        );
        logEvent('User invited to organization', { organization: organization?.id });
      }
      try {
        emailSender.send(
          config.senderIsReceiver ? user.email : email.toLowerCase(),
          organization ? `Invitation to ${organization.name} on Cella` : 'Invitation to Cella',
          emailHtml,
        );
      } catch (error) {
        const errorMessage = (error as Error).message;
        logEvent('Error sending email', { errorMessage }, 'error');
      }
    }

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  /*
   * Paddle webhook
   */
  .openapi(paddleWebhookRouteConfig, async (ctx) => {
    const signature = ctx.req.header('paddle-signature');
    const rawRequestBody = String(ctx.req.raw.body);

    try {
      if (signature && rawRequestBody) {
        const eventData = paddle.webhooks.unmarshal(rawRequestBody, env.PADDLE_WEBHOOK_KEY || '', signature);
        switch (eventData?.eventType) {
          case EventName.SubscriptionCreated:
            logEvent(`Subscription ${eventData.data.id} was created`, {
              ecent: JSON.stringify(eventData),
            });
            break;
          default:
            logEvent('Unhandled paddle event', {
              event: JSON.stringify(eventData),
            });
        }
      }
    } catch (error) {
      logEvent('Error handling paddle webhook', { error: (error as Error).message }, 'error');
    }

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  /*
   * Get suggestions
   */
  .openapi(suggestionsConfig, async (ctx) => {
    const { q, type } = ctx.req.valid('query');
    const result = [];

    if (type === 'user' || !type) {
      const users = await db
        .select({
          id: usersTable.id,
          slug: usersTable.slug,
          name: usersTable.name,
          email: usersTable.email,
          thumbnailUrl: usersTable.thumbnailUrl,
        })
        .from(usersTable)
        .where(or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`)))
        .limit(10);

      result.push(...users.map((user) => ({ ...user, type: 'user' as const })));
    }

    if (type === 'organization' || !type) {
      const organizations = await db
        .select({
          id: organizationsTable.id,
          slug: organizationsTable.slug,
          name: organizationsTable.name,
          thumbnailUrl: organizationsTable.thumbnailUrl,
        })
        .from(organizationsTable)
        .where(ilike(organizationsTable.name, `%${q}%`))
        .limit(10);

      result.push(...organizations.map((organization) => ({ ...organization, type: 'organization' as const })));
    }

    return ctx.json({
      success: true,
      data: result,
    });
  })
  .get('/sse', auth(), async (ctx) => {
    const user = ctx.get('user');
    return streamSSE(ctx, async (stream) => {
      streams.set(user.id, stream);
      console.info('User connected to SSE', user.id);
      stream.writeSSE({
        event: 'connected',
        data: 'connected',
      });

      stream.onAbort(() => {
        console.info('User disconnected from SSE', user.id);
        streams.delete(user.id);
        stream.close();
      });
    });
  });

export default generalRoutes;

export type GeneralRoutes = typeof generalRoutes;
