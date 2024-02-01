import { render } from '@react-email/render';
import { config } from 'config';
import { AnyColumn, SQL, and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { emailSender } from 'emails';
import { InviteUserToOrganizationEmail } from 'emails/invite';
import { env } from 'env';
import { setCookie } from 'hono/cookie';
import { getI18n } from 'i18n';
import { TimeSpan, User, generateId } from 'lucia';
import { nanoid } from 'nanoid';
import { createDate, isWithinExpirationDate } from 'oslo';
import { Argon2id } from 'oslo/password';
import slugify from 'slugify';
import { db } from '../../db/db';
import { auth } from '../../db/lucia';
import { MembershipModel, membershipsTable, organizationsTable, tokensTable, usersTable } from '../../db/schema';
import { createError } from '../../lib/errors';
import { transformDatabaseUser } from '../../lib/transform-database-user';
import { CustomHono, ErrorResponse } from '../../types/common';
import { githubSignInRoute } from '../auth/schema';
import { customLogger } from '../middlewares/custom-logger';
import {
  acceptInvitationToOrganizationRoute,
  checkIsEmailExistsByInviteTokenRoute,
  createOrganizationRoute,
  deleteOrganizationRoute,
  deleteUserFromOrganizationRoute,
  getOrganizationByIdOrSlugRoute,
  getOrganizationsRoute,
  getUsersByOrganizationIdRoute,
  inviteUserToOrganizationRoute,
  updateOrganizationRoute,
  updateUserInOrganizationRoute,
} from './schema';

const i18n = getI18n('backend');

const app = new CustomHono();

// routes
const organizationsRoutes = app
  .openapi(createOrganizationRoute, async (ctx) => {
    const { name } = ctx.req.valid('json');
    const user = ctx.get('user');

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.name, name));

    if (organization) {
      customLogger('Organization with this name exists', { name });

      return ctx.json<ErrorResponse>(
        createError(i18n, 'error.organization_with_this_name_exists', 'Organization with this name already exists'),
        400,
      );
    }

    const [createdOrganization] = await db
      .insert(organizationsTable)
      .values({
        name,
        slug: slugify(name, {
          lower: true,
        }),
        createdBy: user.id,
      })
      .returning();

    customLogger('Organization created', {
      organizationId: createdOrganization.id,
      organizationSlug: createdOrganization.slug,
    });

    return ctx.json({
      success: true,
      data: {
        ...createdOrganization,
        userRole: 'ADMIN' as const,
      },
    });
  })
  .openapi(getOrganizationsRoute, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = ctx.get('user');

    const orderFunc = order === 'asc' ? asc : desc;

    let orderColumn: AnyColumn;
    switch (sort) {
      case 'name':
        orderColumn = organizationsTable.name;
        break;
      case 'createdAt':
        orderColumn = organizationsTable.createdAt;
        break;
      default:
        orderColumn = organizationsTable.id;
        break;
    }

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, `%${q}%`) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter).orderBy(orderFunc(orderColumn));

    const [{ total }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(organizationsQuery.as('organizations'));

    if (user.role === 'ADMIN') {
      const result = await organizationsQuery.limit(+limit).offset(+offset);

      const organizations = result.map((organization) => ({
        ...organization,
        userRole: 'ADMIN' as const,
      }));

      customLogger('Organizations returned');

      return ctx.json({
        success: true,
        data: {
          items: organizations,
          total,
        },
      });
    }

    const result = await db
      .select({
        organization: organizationsTable,
        membership: membershipsTable,
      })
      .from(organizationsQuery.as('organizations'))
      .where(eq(membershipsTable.userId, user.id))
      .innerJoin(membershipsTable, eq(membershipsTable.organizationId, organizationsTable.id))
      .orderBy(sort === 'userRole' ? orderFunc(membershipsTable.role) : asc(organizationsTable.id))
      .limit(+limit)
      .offset(+offset);

    const organizations = result.map(({ organization, membership }) => ({
      ...organization,
      userRole: membership.role,
    }));

    customLogger('Organizations returned');

    return ctx.json({
      success: true,
      data: {
        items: organizations,
        total,
      },
    });
  })
  .openapi(updateOrganizationRoute, async (ctx) => {
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    const {
      name,
      shortName,
      country,
      timezone,
      defaultLanguage,
      languages,
      notificationEmail,
      emailDomains,
      brandColor,
      thumbnailUrl,
      logoUrl,
      bannerUrl,
      websiteUrl,
      welcomeText,
      authStrategies,
      chatSupport,
    } = ctx.req.valid('json');

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        name,
        slug: name
          ? slugify(name, {
              lower: true,
            })
          : undefined,
        shortName,
        country,
        timezone,
        defaultLanguage,
        languages,
        notificationEmail,
        emailDomains,
        brandColor,
        thumbnailUrl,
        logoUrl,
        bannerUrl,
        websiteUrl,
        welcomeText,
        authStrategies,
        chatSupport,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(organizationsTable.id, organization.id))
      .returning();

    customLogger('Organization updated', {
      organizationId: updatedOrganization.id,
      organizationSlug: updatedOrganization.slug,
    });

    return ctx.json({
      success: true,
      data: {
        ...updatedOrganization,
        userRole: 'ADMIN' as const,
      },
    });
  })
  .openapi(updateUserInOrganizationRoute, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const { role } = ctx.req.valid('json');
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!targetUser) {
      customLogger('User not found', { userId });

      return ctx.json(createError(i18n, 'error.user_not_found', 'User not found'), 404);
    }

    const [membership] = await db
      .update(membershipsTable)
      .set({ role, modifiedBy: user.id, modifiedAt: new Date() })
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)))
      .returning();

    if (!membership) {
      customLogger('Membership not found', {
        userId: targetUser.id,
        userSlug: targetUser.slug,
        organizationId: organization.id,
        organizationSlug: organization.slug,
      });

      return ctx.json(createError(i18n, 'error.user_not_found', 'User not found'), 404);
    }

    customLogger('User updated in organization', {
      userId: targetUser.id,
      userSlug: targetUser.slug,
      organizationId: organization.id,
      organizationSlug: organization.slug,
    });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(targetUser),
        organizationRole: membership.role,
      },
    });
  })
  .openapi(deleteOrganizationRoute, async (ctx) => {
    const organization = ctx.get('organization');

    await db.delete(organizationsTable).where(eq(organizationsTable.id, organization.id));

    customLogger('Organization deleted', {
      organizationId: organization.id,
      organizationSlug: organization.slug,
    });

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .openapi(getOrganizationByIdOrSlugRoute, async (ctx) => {
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    if (user.role === 'ADMIN') {
      customLogger('Organization returned', {
        organizationId: organization.id,
        organizationSlug: organization.slug,
      });

      return ctx.json({
        success: true,
        data: {
          ...organization,
          userRole: 'ADMIN' as const,
        },
      });
    }

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id)));

    customLogger('Organization returned', {
      organizationId: organization.id,
      organizationSlug: organization.slug,
    });

    return ctx.json({
      success: true,
      data: {
        ...organization,
        userRole: membership.role,
      },
    });
  })
  .openapi(getUsersByOrganizationIdRoute, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');
    const organization = ctx.get('organization');

    const orderFunc = order === 'asc' ? asc : desc;

    let orderColumn: AnyColumn;
    switch (sort) {
      case 'name':
        orderColumn = usersTable.name;
        break;
      case 'email':
        orderColumn = usersTable.email;
        break;
      case 'createdAt':
        orderColumn = usersTable.createdAt;
        break;
      case 'lastSeenAt':
        orderColumn = usersTable.lastSeenAt;
        break;
      default:
        orderColumn = usersTable.id;
        break;
    }

    const filter: SQL | undefined = q ? ilike(usersTable.email, `%${q}%`) : undefined;

    const usersQuery = db.select().from(usersTable).where(filter).as('users');

    const membersFilters = [eq(membershipsTable.organizationId, organization.id)];

    if (role) {
      membersFilters.push(eq(membershipsTable.role, role.toUpperCase() as MembershipModel['role']));
    }

    const membersQuery = db
      .select({
        user: usersTable,
        membership: membershipsTable,
      })
      .from(membershipsTable)
      .where(and(...membersFilters))
      .orderBy(sort === 'organizationRole' ? orderFunc(membershipsTable.role) : orderFunc(orderColumn))
      .innerJoin(usersQuery, eq(membershipsTable.userId, usersTable.id));

    const [{ total }] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
      })
      .from(membersQuery.as('memberships'));

    customLogger('Members returned');

    const result = await membersQuery.limit(+limit).offset(+offset);

    const members = result.map(({ user, membership }) => ({
      ...transformDatabaseUser(user),
      organizationRole: membership.role,
    }));

    return ctx.json({
      success: true,
      data: {
        items: members,
        total,
      },
    });
  })
  .openapi(inviteUserToOrganizationRoute, async (ctx) => {
    const { emails } = ctx.req.valid('json');
    const user = ctx.get('user');

    for (const email of emails) {
      const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

      const organization = ctx.get('organization');

      if (targetUser) {
        const [existingMembership] = await db
          .select()
          .from(membershipsTable)
          .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, targetUser.id)));

        if (existingMembership) {
          customLogger('User already member of organization', {
            userId: targetUser.id,
            userSlug: targetUser.slug,
            organizationId: organization.id,
            organizationSlug: organization.slug,
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
        organizationId: organization.id,
        expiresAt: createDate(new TimeSpan(7, 'd')),
      });

      const emailLanguage = organization.defaultLanguage || targetUser.language;

      await i18n.changeLanguage(i18n.languages.includes(emailLanguage) ? emailLanguage : config.defaultLanguage);

      const emailHtml = render(
        InviteUserToOrganizationEmail({
          orgName: organization.name || '',
          orgImage: organization.logoUrl || '',
          userImage: targetUser?.thumbnailUrl || '',
          username: targetUser?.name || email.toLowerCase() || '',
          inviteUrl: `${config.frontendUrl}/auth/accept-invite/${token}`,
          i18n,
        }),
      );

      try {
        emailSender.send(
          env.SEND_ALL_TO_EMAIL || config.senderIsReceiver ? user.email : email.toLowerCase(),
          `Added to ${organization.name} on Cella`,
          emailHtml,
        );
      } catch (error) {
        customLogger(
          'Error sending email',
          {
            errorMessage: (error as Error).message,
          },
          'error',
        );
      }

      customLogger('User invited to organization', {
        userId: user?.id,
        userSlug: user?.slug,
        organizationId: organization.id,
        organizationSlug: organization.slug,
      });
    }

    return ctx.json({
      success: true,
      data: undefined,
    });
  })
  .openapi(checkIsEmailExistsByInviteTokenRoute, async (ctx) => {
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
  .openapi(acceptInvitationToOrganizationRoute, async (ctx) => {
    const { password, oauth } = ctx.req.valid('json');
    const verificationToken = ctx.req.valid('param').token;

    const [token] = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.id, verificationToken)));

    if (!token || !token.organizationId || !token.email || !isWithinExpirationDate(token.expiresAt)) {
      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, token.organizationId));

    if (!organization) {
      return ctx.json(createError(i18n, 'error.organization_not_found', 'Organization not found'), 404);
    }

    let user: User;

    if (token.userId) {
      [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, token.userId)));

      if (!user || user.email !== token.email) {
        return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
      }
    } else if (password || oauth) {
      const hashedPassword = password ? await new Argon2id().hash(password) : undefined;
      const userId = nanoid();

      [user] = await db
        .insert(usersTable)
        .values({
          id: userId,
          slug: userId,
          language: organization.defaultLanguage || config.defaultLanguage,
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
      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    await db
      .insert(membershipsTable)
      .values({
        organizationId: token.organizationId,
        userId: user.id,
        role: 'MEMBER',
        createdBy: user.id,
      })
      .returning();

    if (oauth === 'github') {
      const response = await fetch(`${config.backendUrl + githubSignInRoute.path}?redirect=${organization.slug}`, {
        method: githubSignInRoute.method,
        redirect: 'manual',
      });

      const url = response.headers.get('Location');

      if (response.status === 302 && url) {
        ctx.header('Set-Cookie', response.headers.get('Set-Cookie') ?? '', {
          append: true,
        });
        setCookie(ctx, 'oauth_invite_token', verificationToken, {
          secure: config.mode === 'production', // set `Secure` flag in HTTPS
          path: '/',
          httpOnly: true,
          maxAge: 60 * 10, // 10 min
        });

        return ctx.json({
          success: true,
          data: url,
        });

        // return ctx.json({}, 302, {
        //   Location: url,
        // });
        // return ctx.redirect(url, 302);
      }

      return ctx.json(createError(i18n, 'error.invalid_token', 'Invalid token'), 400);
    }

    return ctx.json({
      success: true,
      data: `${config.frontendUrl}/${organization.slug}`,
    });
  })
  .openapi(deleteUserFromOrganizationRoute, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const organization = ctx.get('organization');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!user) {
      customLogger('User not found', { userId });

      return ctx.json(createError(i18n, 'error.user_not_found', 'User not found'), 404);
    }

    const [membership] = await db
      .delete(membershipsTable)
      .where(and(eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.userId, user.id)))
      .returning();

    customLogger('User deleted from organization', {
      userId: user.id,
      userSlug: user.slug,
      organizationId: organization.id,
      organizationSlug: organization.slug,
    });

    return ctx.json({
      success: true,
      data: {
        ...transformDatabaseUser(user),
        organizationRole: membership.role,
      },
    });
  });

export default organizationsRoutes;
