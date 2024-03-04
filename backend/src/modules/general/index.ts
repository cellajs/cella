import { and, eq } from 'drizzle-orm';
import { emailSender } from '../../../../email';
import { InviteEmail } from '../../../../email/emails/invite';

import { render } from '@react-email/render';
import { config } from 'config';
import { env } from 'env';
import jwt from 'jsonwebtoken';
import { User, generateId } from 'lucia';
import { TimeSpan, createDate } from 'oslo';

import { db } from '../../db/db';

import { membershipsTable } from '../../db/schema/memberships';
import { OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { tokensTable } from '../../db/schema/tokens';
import { usersTable } from '../../db/schema/users';
import { customLogger } from '../../lib/custom-logger';
import { forbiddenError } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { CustomHono, ErrorResponse } from '../../types/common';
import { checkSlugRoute, getUploadTokenRoute, inviteRoute } from './routes';

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

    return ctx.json({
      success: true,
      data: token,
    });
  })
  .openapi(checkSlugRoute, async (ctx) => {
    const { slug } = ctx.req.valid('param');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, slug));

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));

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
          customLogger('User invited on system level');
        } else {
          customLogger('User already exists', { user: targetUser.id }, 'warn');
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
        customLogger('User invited to organization', { organization: organization?.id });
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
  });

export default generalRoutes;
