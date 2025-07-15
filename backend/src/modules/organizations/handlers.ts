import { OpenAPIHono, type z } from '@hono/zod-openapi';
import { config } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';

import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { ApiError, createError, type ErrorType } from '#/lib/errors';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getMemberCountsQuery, getRelatedEntityCountsQuery } from '#/modules/entities/helpers/counts';
import { getRelatedEntities, type ValidEntities } from '#/modules/entities/helpers/get-related-entities';
import { insertMembership } from '#/modules/memberships/helpers';
import { membershipSummarySelect } from '#/modules/memberships/helpers/select';
import organizationRoutes from '#/modules/organizations/routes';
import type { membershipCountSchema } from '#/modules/organizations/schema';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const organizationRouteHandlers = app
  /*
   * Create organization
   */
  .openapi(organizationRoutes.createOrganization, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = getContextUser();
    const memberships = getContextMemberships();

    const createdOrgsCount = memberships.reduce((count, m) => {
      return m.contextType === 'organization' && m.createdBy === user.id ? count + 1 : count;
    }, 0);

    if (createdOrgsCount === 5) throw new ApiError({ status: 403, type: 'restrict_by_app', severity: 'warn', entityType: 'organization' });

    // Check if slug is available
    const slugAvailable = await checkSlugAvailable(slug);
    if (!slugAvailable) throw new ApiError({ status: 409, type: 'slug_exists', severity: 'warn', entityType: 'organization', eventData: { slug } });

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
    const createdMembership = await insertMembership({ userId: user.id, role: 'admin', entity: createdOrganization });

    const data = {
      ...createdOrganization,
      membership: createdMembership,
      invitesCount: 0,
    };

    return ctx.json(data, 200);
  })
  /*
   * Get list of organizations
   */
  .openapi(organizationRoutes.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const user = getContextUser();
    const entityType = 'organization';

    const filter: SQL | undefined = q ? ilike(organizationsTable.name, prepareStringForILikeFilter(q)) : undefined;

    const organizationsQuery = db.select().from(organizationsTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(organizationsQuery.as('organizations'));

    const memberships = db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.contextType, entityType)))
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

    const membershipCountsQuery = getMemberCountsQuery(entityType);
    const relatedCountsQuery = getRelatedEntityCountsQuery(entityType);

    const validEntities = getRelatedEntities(entityType);

    const relatedJsonPairs = validEntities.map((entity) => `'${entity}', COALESCE("related_counts"."${entity}", 0)`).join(', ');
    const organizations = await db
      .select({
        ...getTableColumns(organizationsTable),
        membership: membershipSummarySelect,
        counts: {
          membership: sql<
            z.infer<typeof membershipCountSchema>
          >`json_build_object('admin', ${membershipCountsQuery.admin}, 'member', ${membershipCountsQuery.member}, 'pending', ${membershipCountsQuery.pending}, 'total', ${membershipCountsQuery.member})`,
          related: sql<Record<ValidEntities<'organizationId'>, number>>`json_build_object(${sql.raw(relatedJsonPairs)})`,
        },
      })
      .from(organizationsQuery.as('organizations'))
      .leftJoin(memberships, and(eq(organizationsTable.id, memberships.organizationId), eq(memberships.userId, user.id)))
      .leftJoin(membershipCountsQuery, eq(organizationsTable.id, membershipCountsQuery.id))
      .leftJoin(relatedCountsQuery, eq(organizationsTable.id, relatedCountsQuery.id))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json({ items: organizations, total }, 200);
  })
  /*
   * Delete organizations by ids
   */
  .openapi(organizationRoutes.deleteOrganizations, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new ApiError({ status: 400, type: 'invalid_request', severity: 'error', entityType: 'organization' });

    // Split ids into allowed and disallowed
    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'organization', toDeleteIds, memberships);
    if (!allowedIds.length) throw new ApiError({ status: 403, type: 'forbidden', severity: 'warn', entityType: 'organization' });

    // Map errors of organization user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'organization', { organization: id }));

    // Get ids of members for organizations
    const memberIds = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.contextType, 'organization'), inArray(membershipsTable.organizationId, allowedIds)));

    // Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    // Send SSE events to all members of organizations that were deleted
    for (const id of allowedIds) {
      if (!memberIds.length) continue;

      const userIds = memberIds.map((m) => m.id);
      sendSSEToUsers(userIds, 'remove_entity', { id, entityType: 'organization' });
    }

    logEvent('Organizations deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors }, 200);
  })
  /*
   * Get organization by id or slug
   */
  .openapi(organizationRoutes.getOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, membership } = await getValidContextEntity(idOrSlug, 'organization', 'read');

    const memberCountsQuery = getMemberCountsQuery(organization.entityType);
    const [{ invitesCount }] = await db
      .select({ invitesCount: memberCountsQuery.pending })
      .from(memberCountsQuery)
      .where(eq(memberCountsQuery.id, organization.id));

    const data = { ...organization, membership, invitesCount };

    return ctx.json(data, 200);
  })
  /*
   * Update an organization by id or slug
   */
  .openapi(organizationRoutes.updateOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, membership } = await getValidContextEntity(idOrSlug, 'organization', 'update');

    const user = getContextUser();

    const updatedFields = ctx.req.valid('json');
    const slug = updatedFields.slug;

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) throw new ApiError({ status: 409, type: 'slug_exists', severity: 'warn', entityType: 'organization', eventData: { slug } });
    }

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(organizationsTable.id, organization.id))
      .returning();

    const organizationMemberships = await db
      .select(membershipSummarySelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.contextType, 'organization'), eq(membershipsTable.organizationId, organization.id)));

    // Send SSE events to organization members
    for (const member of organizationMemberships) sendSSEToUsers([member.userId], 'update_entity', { ...updatedOrganization, member });

    logEvent('Organization updated', { organization: updatedOrganization.id });

    const memberCountsQuery = getMemberCountsQuery(organization.entityType);
    const [{ invitesCount }] = await db
      .select({ invitesCount: memberCountsQuery.pending })
      .from(memberCountsQuery)
      .where(eq(memberCountsQuery.id, organization.id));

    // Prepare data
    const data = {
      ...updatedOrganization,
      membership,
      invitesCount,
    };

    return ctx.json(data, 200);
  });

export default organizationRouteHandlers;
