import { type SQL, and, count, eq, getTableColumns, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';

import { config } from 'config';
import { render } from 'jsx-email';
import { usersTable } from '#/db/schema/users';
import { getUserBy } from '#/db/util';
import { getAllowedIds, getContextUser, getDisallowedIds, getOrganization } from '#/lib/context';
import { memberCountsQuery } from '#/lib/counts';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { emailSender } from '#/lib/mailer';
import { getOrderColumn } from '#/lib/order-column';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import organizationsNewsletter from '../../../emails/organization-newsletter';
import { env } from '../../../env';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { insertMembership } from '../memberships/helpers/insert-membership';
import organizationRoutesConfig from './routes';

const app = new CustomHono();

// Organization endpoints
const organizationsRoutes = app
  /*
   * Create organization
   */
  .openapi(organizationRoutesConfig.createOrganization, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = getContextUser();

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'organization', { slug });

    const [createdOrganization] = await db
      .insert(organizationsTable)
      .values({
        name,
        shortName: name,
        slug,
        languages: [config.defaultLanguage],
        defaultLanguage: config.defaultLanguage,
        createdBy: user.id,
      })
      .returning();

    logEvent('Organization created', { organization: createdOrganization.id });

    // Insert membership
    const createdMembership = await insertMembership({ user, role: 'admin', entity: createdOrganization });

    return ctx.json(
      {
        success: true,
        data: {
          ...createdOrganization,
          membership: createdMembership,
          counts: {
            memberships: {
              admins: 1,
              members: 1,
              total: 1,
            },
          },
        },
      },
      200,
    );
  })
  /*
   * Get list of organizations
   */
  .openapi(organizationRoutesConfig.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = getContextUser();

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, `%${q}%`) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(organizationsQuery.as('organizations'));

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.type, 'organization')))
      .as('memberships');

    const orderColumn = getOrderColumn(
      {
        id: organizationsTable.id,
        name: organizationsTable.name,
        createdAt: organizationsTable.createdAt,
        userRole: memberships.role,
      },
      sort,
      organizationsTable.id,
      order,
    );

    const countsQuery = memberCountsQuery('organization', 'organizationId');

    const organizations = await db
      .select({
        ...getTableColumns(organizationsTable),
        membership: membershipSelect,
        counts: {
          memberships: sql<{
            admins: number;
            members: number;
            total: number;
          }>`json_build_object('admins', ${countsQuery.admins}, 'members', ${countsQuery.members}, 'total', ${countsQuery.members})`,
        },
      })
      .from(organizationsQuery.as('organizations'))
      .leftJoin(memberships, eq(organizationsTable.id, memberships.organizationId))
      .leftJoin(countsQuery, eq(organizationsTable.id, countsQuery.id))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json(
      {
        success: true,
        data: {
          items: organizations,
          total,
        },
      },
      200,
    );
  })
  /*
   * Update an organization by id or slug
   */
  .openapi(organizationRoutesConfig.updateOrganization, async (ctx) => {
    const user = getContextUser();
    const organization = getOrganization();

    const {
      name,
      slug,
      shortName,
      country,
      timezone,
      defaultLanguage,
      languages,
      notificationEmail,
      emailDomains,
      color,
      thumbnailUrl,
      logoUrl,
      bannerUrl,
      websiteUrl,
      welcomeText,
      authStrategies,
      chatSupport,
    } = ctx.req.valid('json');

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'organization', { slug });
      }
    }

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        name,
        slug,
        shortName,
        country,
        timezone,
        defaultLanguage,
        languages,
        notificationEmail,
        emailDomains,
        color,
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

    const memberships = await db
      .select(membershipSelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'organization'), eq(membershipsTable.organizationId, organization.id)));

    if (memberships.length > 0) {
      memberships.map((membership) =>
        sendSSEToUsers([membership.userId], 'update_entity', {
          ...updatedOrganization,
          membership: memberships.find((m) => m.id === membership.id) ?? null,
        }),
      );
    }

    logEvent('Organization updated', { organization: updatedOrganization.id });

    const memberCounts = await memberCountsQuery('organization', 'organizationId', organization.id);

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedOrganization,
          membership: memberships.find((m) => m.id === user.id) ?? null,
          counts: {
            memberships: memberCounts,
          },
        },
      },
      200,
    );
  })
  /*
   * Get organization by id or slug
   */
  .openapi(organizationRoutesConfig.getOrganization, async (ctx) => {
    const user = getContextUser();
    const organization = getOrganization();

    const [membership] = await db
      .select(membershipSelect)
      .from(membershipsTable)
      .where(
        and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.type, 'organization')),
      );

    const memberCounts = await memberCountsQuery('organization', 'organizationId', organization.id);

    return ctx.json(
      {
        success: true,
        data: {
          ...organization,
          membership,
          counts: {
            memberships: memberCounts,
          },
        },
      },
      200,
    );
  })

  /*
   * Delete organizations by ids
   */
  .openapi(organizationRoutesConfig.deleteOrganizations, async (ctx) => {
    // Extract allowed and disallowed ids
    const allowedIds = getAllowedIds();
    const disallowedIds = getDisallowedIds();

    // Map errors of organizations user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'organization', { organization: id }));

    // Get members
    const organizationsMembers = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'organization'), inArray(membershipsTable.organizationId, allowedIds)));

    // Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    // Send SSE events for the organizations that were deleted
    for (const id of allowedIds) {
      // Send the event to the user if they are a member of the organization
      if (organizationsMembers.length > 0) {
        const membersId = organizationsMembers.map((member) => member.id);
        sendSSEToUsers(membersId, 'remove_entity', { id, entity: 'organization' });
      }

      logEvent('Organization deleted', { organization: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  })
  /*
   * Send newsletter email
   */
  .openapi(organizationRoutesConfig.sendNewsletterEmail, async (ctx) => {
    const user = getContextUser();
    const { organizationIds, subject, content } = ctx.req.valid('json');
    // For test purposes
    if (typeof env.SEND_ALL_TO_EMAIL === 'string' && env.NODE_ENV === 'development') {
      const userFromDb = await getUserBy('id', user.id, 'unsafe');

      if (!userFromDb) return errorResponse(ctx, 404, 'User not found', 'warn', 'organization');

      const unsubscribeLink = `${config.backendUrl}/unsubscribe?token=${userFromDb.unsubscribeToken}`;
      // generating email html
      const emailHtml = await render(
        organizationsNewsletter({ userLanguage: user.language, subject, content, unsubscribeLink, authorEmail: user.email, orgName: 'SOME NAME' }),
      );
      emailSender.send(env.SEND_ALL_TO_EMAIL, user.newsletter ? subject : 'User unsubscribed from newsletter', emailHtml);
    } else {
      // Get members
      const organizationsMembersEmails = await db
        .select({
          membershipId: membershipsTable.userId,
          email: usersTable.email,
          unsubscribeToken: usersTable.unsubscribeToken,
          newsletter: usersTable.newsletter,
          language: usersTable.language,
        })
        .from(membershipsTable)
        .innerJoin(usersTable, and(eq(usersTable.id, membershipsTable.userId)))
        // eq(usersTable.emailVerified, true) // maybe add for only confirmed emails
        .where(and(eq(membershipsTable.type, 'organization'), inArray(membershipsTable.organizationId, organizationIds)));

      if (!organizationsMembersEmails.length) return errorResponse(ctx, 404, 'There is no members in organizations', 'warn', 'organization');

      if (organizationsMembersEmails.length === 1 && user.email === organizationsMembersEmails[0].email)
        return errorResponse(ctx, 400, 'Only receiver is sender', 'warn', 'organization');

      for (const member of organizationsMembersEmails) {
        if (!member.newsletter) continue;
        const [organization] = await db
          .select({
            name: organizationsTable.name,
          })
          .from(organizationsTable)
          .innerJoin(membershipsTable, and(eq(membershipsTable.userId, member.membershipId)))
          .where(eq(organizationsTable.id, membershipsTable.organizationId));
        const unsubscribeLink = `${config.backendUrl}/unsubscribe?token=${member.unsubscribeToken}`;
        // generating email html
        const emailHtml = await render(
          organizationsNewsletter({
            userLanguage: member.language,
            subject,
            content,
            unsubscribeLink,
            authorEmail: user.email,
            orgName: organization?.name ?? 'Organization',
          }),
        );

        emailSender.send(member.email, subject, emailHtml);
      }
    }

    return ctx.json({ success: true }, 200);
  });

export default organizationsRoutes;
