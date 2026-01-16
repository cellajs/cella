import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextUser, getContextUserSystemRole } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { sendSSEByUserIds } from '#/lib/sse';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntityCounts } from '#/modules/entities/helpers/counts';
import { getMemberCountsQuery } from '#/modules/entities/helpers/counts/member';
import { getRelatedEntityCountsQuery } from '#/modules/entities/helpers/counts/related-entities';
import { getEntityTypesScopedByContextEntityType } from '#/modules/entities/helpers/get-related-entities';
import { insertMemberships } from '#/modules/memberships/helpers';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import organizationRoutes from '#/modules/organizations/organizations-routes';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { defaultWelcomeText } from '#json/text-blocks.json';

const app = new OpenAPIHono<Env>({ defaultHook });

const organizationRouteHandlers = app
  /**
   * Create organization
   */
  .openapi(organizationRoutes.createOrganization, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = getContextUser();
    const memberships = getContextMemberships();

    const createdOrgsCount = memberships.reduce((count, m) => {
      return m.contextType === 'organization' && m.createdBy === user.id ? count + 1 : count;
    }, 0);

    if (createdOrgsCount === 5)
      throw new AppError({ status: 403, type: 'restrict_by_app', severity: 'warn', entityType: 'organization' });

    // Check if slug is available
    const slugAvailable = await checkSlugAvailable(slug);
    if (!slugAvailable)
      throw new AppError({
        status: 409,
        type: 'slug_exists',
        severity: 'warn',
        entityType: 'organization',
        meta: { slug },
      });

    const [createdOrganization] = await db
      .insert(organizationsTable)
      .values({
        name,
        shortName: name,
        slug,
        languages: [appConfig.defaultLanguage],
        welcomeText: defaultWelcomeText,
        defaultLanguage: appConfig.defaultLanguage,
        createdBy: user.id,
      })
      .returning();

    logEvent('info', 'Organization created', { organizationId: createdOrganization.id });

    // Insert membership
    const [createdMembership] = await insertMemberships([
      { userId: user.id, createdBy: user.id, role: 'admin', entity: createdOrganization },
    ]);

    // Get default linked entities
    const validEntities = getEntityTypesScopedByContextEntityType(createdOrganization.entityType);
    const entitiesCountsArray = validEntities.map((entityType) => [entityType, 0]);
    const entitiesCounts = Object.fromEntries(entitiesCountsArray) as Record<(typeof validEntities)[number], number>;
    // Default member counts
    const memberCounts = { pending: 0, admin: 1, member: 0, total: 1 };

    const data = {
      ...createdOrganization,
      membership: createdMembership,
      counts: { membership: memberCounts, entities: entitiesCounts },
    };

    return ctx.json(data, 201);
  })
  /**
   * Get list of organizations
   */
  .openapi(organizationRoutes.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit, userId, role, excludeArchived } = ctx.req.valid('query');

    const entityType = 'organization';

    const user = getContextUser();
    const userSystemRole = getContextUserSystemRole();
    const isSystemAdmin = userSystemRole === 'admin' && !userId;

    const targetUserId = userId ?? user.id;

    // Base membership join key (who we're attaching membership for)
    const membershipKeyOn = and(
      eq(membershipsTable.organizationId, organizationsTable.id),
      eq(membershipsTable.userId, targetUserId),
      eq(membershipsTable.contextType, entityType),
    );

    // Membership filters (role/archived) that should NOT restrict admins from seeing orgs.
    // Put these in JOIN ON so they only control whether the membership row is present.
    const membershipFilterOn = and(
      ...(excludeArchived ? [eq(membershipsTable.archived, false)] : []),
      ...(role ? [eq(membershipsTable.role, role)] : []),
    );

    const membershipOn = and(membershipKeyOn, membershipFilterOn);

    // Org-only filters belong in WHERE (safe for both admin + non-admin)
    const orgWhere: SQL[] = [...(q ? [ilike(organizationsTable.name, prepareStringForILikeFilter(q))] : [])];

    const membershipCountsQuery = getMemberCountsQuery(entityType);
    const relatedCountsQuery = getRelatedEntityCountsQuery(entityType);

    const validEntities = getEntityTypesScopedByContextEntityType(entityType);
    const relatedJsonPairs = validEntities
      .map((entity) => `'${entity}', COALESCE("related_counts"."${entity}", 0)`)
      .join(', ');

    // Base query for total
    const totalQuery = isSystemAdmin
      ? db
          .select({ orgId: organizationsTable.id })
          .from(organizationsTable)
          .leftJoin(membershipsTable, membershipOn)
          .where(and(...orgWhere))
          .as('base')
      : db
          .select({ orgId: organizationsTable.id })
          .from(organizationsTable)
          .innerJoin(membershipsTable, membershipOn)
          .where(and(...orgWhere))
          .as('base');

    const [{ total }] = await db.select({ total: count() }).from(totalQuery);

    const orderColumn = getOrderColumn(
      {
        id: organizationsTable.id,
        name: organizationsTable.name,
        createdAt: organizationsTable.createdAt,
        userRole: membershipsTable.role,
      },
      sort,
      organizationsTable.id,
      order,
    );

    const selectShape = {
      ...getTableColumns(organizationsTable),
      membership: membershipBaseSelect,
      counts: {
        membership: sql`
        json_build_object(
          'admin', COALESCE(${membershipCountsQuery.admin}, 0),
          'member', COALESCE(${membershipCountsQuery.member}, 0),
          'pending', COALESCE(${membershipCountsQuery.pending}, 0),
          'total', COALESCE(${membershipCountsQuery.total}, 0)
        )`,
        entities: sql`json_build_object(${sql.raw(relatedJsonPairs)})`,
      },
    } as const;

    const organizations = await db
      .select(selectShape)
      .from(organizationsTable)
      .innerJoin(membershipsTable, membershipOn)
      .leftJoin(membershipCountsQuery, eq(organizationsTable.id, membershipCountsQuery.id))
      .leftJoin(relatedCountsQuery, eq(organizationsTable.id, relatedCountsQuery.id))
      .where(and(...orgWhere))
      .orderBy(orderColumn)
      .limit(limit)
      .offset(offset);

    return ctx.json({ items: organizations, total }, 200);
  })

  /**
   * Get organization by id or slug
   */
  .openapi(organizationRoutes.getOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, membership } = await getValidContextEntity(idOrSlug, 'organization', 'read');

    const counts = await getEntityCounts(organization.entityType, organization.id);
    const data = { ...organization, membership, counts };

    return ctx.json(data, 200);
  })
  /**
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
      if (!slugAvailable)
        throw new AppError({
          status: 409,
          type: 'slug_exists',
          severity: 'warn',
          entityType: 'organization',
          meta: { slug },
        });
    }

    // TODO sanitize blocknote blocks for welcomeText? How to only allow  image urls from our own cdn plus a list from allowed domains?

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(organizationsTable.id, organization.id))
      .returning();

    // notify members (unchanged)
    const organizationMemberships = await db
      .select(membershipBaseSelect)
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.contextType, 'organization'),
          eq(membershipsTable.organizationId, organization.id),
          eq(membershipsTable.archived, false),
        ),
      );

    // Send event to all members about the updated organization
    for (const m of organizationMemberships)
      sendSSEByUserIds([m.userId], 'entity_updated', { ...updatedOrganization, membership: m });

    logEvent('info', 'Organization updated', { organizationId: updatedOrganization.id });

    const counts = await getEntityCounts(organization.entityType, organization.id);
    const data = { ...updatedOrganization, membership, counts };

    return ctx.json(data, 200);
  })
  /**
   * Delete organizations by ids
   */
  .openapi(organizationRoutes.deleteOrganizations, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length)
      throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', entityType: 'organization' });

    // Split ids into allowed and disallowed
    const { allowedIds, disallowedIds: rejectedItems } = await splitByAllowance(
      'delete',
      'organization',
      toDeleteIds,
      memberships,
    );
    if (!allowedIds.length)
      throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType: 'organization' });

    // Get ids of members for organizations
    const memberIds = await db
      .select({ id: membershipsTable.userId })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.contextType, 'organization'),
          inArray(membershipsTable.organizationId, allowedIds),
          eq(membershipsTable.archived, false),
        ),
      );

    // Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    // Send events to all members of all organizations that were deleted
    for (const organizationId of allowedIds) {
      if (!memberIds.length) continue;

      const userIds = memberIds.map((m) => m.id);
      sendSSEByUserIds(userIds, 'entity_deleted', { entityId: organizationId, entityType: 'organization' });
    }

    logEvent('info', 'Organizations deleted', allowedIds);

    return ctx.json({ success: true, rejectedItems }, 200);
  });

export default organizationRouteHandlers;
