import { and, eq, sql } from 'drizzle-orm';
import { emailSender } from '../../../../email';
import { InviteEmail } from '../../../../email/emails/invite';

import { render } from '@react-email/render';
import { config } from 'config';
import { env } from 'env';
import jwt from 'jsonwebtoken';
import { User, generateId } from 'lucia';
import { nanoid } from 'nanoid';
import { TimeSpan, createDate } from 'oslo';
import { isWithinExpirationDate } from 'oslo';
import { Argon2id } from 'oslo/password';
import { db } from '../../db/db';
import { auth } from '../../db/lucia';
import { OrganizationModel, membershipsTable, organizationsTable, tokensTable, usersTable } from '../../db/schema';
import { setCookie } from '../../lib/cookies';
import { customLogger } from '../../lib/custom-logger';
import { createError, forbiddenError } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { CustomHono, ErrorResponse } from '../../types/common';
import { githubSignInRoute } from '../auth/routes';
import { acceptInviteRoute, checkInviteRoute, checkSlugRoute, getPublicCountsRoute, getUploadTokenRoute, inviteRoute } from './routes';

const app = new CustomHono();

// routes
const generalRoutes = app
  .openapi(getUploadTokenRoute, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = ctx.get('user');
    // TODO: validate query param organization
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

    customLogger('Upload token returned');

    return ctx.json({
      success: true,
      data: token,
    });
  })
  .openapi(getPublicCountsRoute, async (ctx) => {
    const [{ total: organizations }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(organizationsTable);

    const [{ total: users }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(usersTable);

    return ctx.json({
      success: true,
      data: {
        organizations,
        users,
      },
    });
  })
  .openapi(checkSlugRoute, async (ctx) => {
    const { slug } = ctx.req.valid('param');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, slug));

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));

    customLogger('Slug checked', { slug, available: !!user || !!organization });

    return ctx.json({
      success: true,
      data: !!user || !!organization,
    });
  })
  .openapi(inviteRoute, async (ctx) => {
    const { emails } = ctx.req.valid('json');
    const user = ctx.get('user');
    const organization = ctx.get('organization') as OrganizationModel | undefined;

    if (!organization && user.role !== 'ADMIN') {
      return ctx.json<ErrorResponse>(forbiddenError(), 403);
    }

    for (const email of emails) {
      const [targetUser] = (await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()))) as (User | undefined)[];

      if (targetUser && organization) {
        const [existingMembership] = await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)));

        if (existingMembership) {
          customLogger('User already member of organization', { user: targetUser.id, organization: organization.id });
          continue;
        }

        if (user.id === targetUser.id) {
          await db
            .insert(membershipsTable)
            .values({
              organizationId: organization.id,
              userId: user.id,
              role: 'MEMBER',
              createdBy: user.id,
            })
            .returning();

          customLogger('User added to organization', { user: user.id, organization: organization.id });
          continue;
        }
      }

      const token = generateId(40);
      await db.insert(tokensTable).values({
        id: token,
        type: 'INVITATION',
        userId: targetUser?.id,
        email: email.toLowerCase(),
        organizationId: organization?.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailLanguage = organization?.defaultLanguage || targetUser?.language || config.defaultLanguage;
      await i18n.changeLanguage(i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage);

      let emailHtml: string;

      if (!organization) {
        if (!targetUser) {
          emailHtml = render(
            InviteEmail({
              username: email.toLowerCase(),
              inviteUrl: `${config.frontendUrl}/auth/accept-invite/${token}`,
              invitedBy: user.name,
              type: 'system',
            }),
          );
          customLogger('User invited to system', { email: email.toLowerCase() });
        } else {
          customLogger('User already exists', { user: targetUser.id });
          continue;
        }
      } else {
        emailHtml = render(
          InviteEmail({
            orgName: organization.name || '',
            orgImage: organization.logoUrl || '',
            userImage: targetUser?.thumbnailUrl ? `${targetUser.thumbnailUrl}?width=100&format=avif` : '',
            username: targetUser?.name || email.toLowerCase() || '',
            invitedBy: user.name,
            inviteUrl: `${config.frontendUrl}/auth/accept-invite/${token}`,
          }),
        );
        customLogger('User invited to organization', { user: email.toLowerCase(), organization: organization?.id });
      }
      try {
        emailSender.send(
          config.senderIsReceiver ? user.email : email.toLowerCase(),
          organization ? `Invitation to ${organization.name} on Cella` : 'Invitation to Cella',
          emailHtml,
        );
      } catch (error) {
        const errorMessage = (error as Error).message;
        customLogger('Error sending email', { errorMessage }, 'error');
      }
    }

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .openapi(checkInviteRoute, async (ctx) => {
    const token = ctx.req.valid('param').token;

    const [tokenRecord] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, token)));

    if (tokenRecord?.email) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, tokenRecord.email));

      if (user) {
        return ctx.json({
          success: true,
        });
      }
    }

    return ctx.json({
      success: false,
    });
  })
  .openapi(acceptInviteRoute, async (ctx) => {
    const { password, oauth } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));

    if (!token || !token.email || !isWithinExpirationDate(token.expiresAt)) {
      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
    }

    let organization: OrganizationModel | undefined;

    if (token.organizationId) {
      [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, token.organizationId));

      if (!organization) {
        return ctx.json(createError('error.organization_not_found', 'Organization not found'), 404);
      }
    }

    let user: User;

    if (token.userId) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, token.userId)));

      if (!user || user.email !== token.email) {
        return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
      }
    } else if (password || oauth) {
      const hashedPassword = password ? await new Argon2id().hash(password) : undefined;
      const userId = nanoid();

      const [slug] = token.email.split('@');

      const response = await fetch(`${config.backendUrl + checkSlugRoute.path.replace('{slug}', slug)}`, {
        method: checkSlugRoute.method,
      });

      const { data: slugExists } = (await response.json()) as { data: boolean };

      [user] = await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: slugExists ? `${slug}-${userId}` : slug,
          language: organization?.defaultLanguage || config.defaultLanguage,
          email: token.email,
          emailVerified: true,
          hashedPassword,
        })
        .returning();

      if (password) {
        await db.delete(tokensTable).where(and(eq(tokensTable.id, verificationToken)));

        const session = await auth.createSession(userId, {});
        const sessionCookie = auth.createSessionCookie(session.id);

        ctx.header('Set-Cookie', sessionCookie.serialize());
      }
    } else {
      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
    }

    if (organization) {
      await db
        .insert(membershipsTable)
        .values({
          organizationId: organization.id,
          userId: user.id,
          role: 'MEMBER',
          createdBy: user.id,
        })
        .returning();
    }

    if (oauth === 'github') {
      const response = await fetch(`${config.backendUrl + githubSignInRoute.path}${organization ? `?redirect=${organization.slug}` : ''}`, {
        method: githubSignInRoute.method,
        redirect: 'manual',
      });

      const url = response.headers.get('Location');

      if (response.status === 302 && url) {
        ctx.header('Set-Cookie', response.headers.get('Set-Cookie') ?? '', {
          append: true,
        });
        setCookie(ctx, 'oauth_invite_token', verificationToken);

        return ctx.json({
          success: true,
          data: url,
        });

        // return ctx.json({}, 302, {
        //   Location: url,
        // });
        // return ctx.redirect(url, 302);
      }

      return ctx.json(createError('error.invalid_token', 'Invalid token'), 400);
    }

    return ctx.json({
      success: true,
      data: organization?.slug || '',
    });
  });

export default generalRoutes;
