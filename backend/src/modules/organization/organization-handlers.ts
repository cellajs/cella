import { OpenAPIHono } from '@hono/zod-openapi';
import { allEntityRoles, appConfig, recordFromKeys } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextUser, getContextUserSystemRole } from '#/lib/context';
import { AppError } from '#/lib/error';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntityCounts, getEntityCountsSelect } from '#/modules/entities/helpers/get-entity-counts';
import { getEntityTypesScopedByContextEntityType } from '#/modules/entities/helpers/get-related-entities';
import { insertMemberships } from '#/modules/memberships/helpers';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import organizationRoutes from '#/modules/organization/organization-routes';
import { getValidContextEntity, isPermissionAllowed } from '#/permissions';
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
   * Create one or more organizations
   */
  .openapi(organizationRoutes.createOrganizations, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = getContextUser();
    const memberships = getContextMemberships();

    const createdOrgsCount = memberships.reduce((count, m) => {
      return m.contextType === 'organization' && m.createdBy === user.id ? count + 1 : count;
    }, 0);

    if (createdOrgsCount === 5) throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'organization' });

    // Check if slug is available
    const slugAvailable = await checkSlugAvailable(slug);
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });

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

    // Build counts
    const validEntities = getEntityTypesScopedByContextEntityType(createdOrganization.entityType);
    const entitiesCounts = recordFromKeys(validEntities, () => 0);
    const entityRoleCounts = recordFromKeys(allEntityRoles, (role) => (role === 'admin' ? 1 : 0));
    const memberCounts = { ...entityRoleCounts, pending: 0, total: 1 };

    // Creator is admin, grant all permissions
    const can = recordFromKeys(appConfig.entityActions, () => true);

    const data = {
      ...createdOrganization,
      membership: createdMembership,
      counts: { membership: memberCounts, entities: entitiesCounts },
      can,
    };

    return ctx.json({ data: [data], rejectedItemIds: [] }, 201);
  })
  /**
   * Get list of organizations
   */
  .openapi(organizationRoutes.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit, userId, role, excludeArchived, include } = ctx.req.valid('query');

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

    // Get reusable count subqueries and select shape (only when requested)
    const includeCounts = include.includes('counts');
    const countData = includeCounts ? getEntityCountsSelect(entityType) : null;

    // System admin can see all orgs (no join needed), others need membership
    const baseQuery = db.select({ orgId: organizationsTable.id }).from(organizationsTable);

    const totalQuery = isSystemAdmin
      ? baseQuery.where(and(...orgWhere)).as('base')
      : baseQuery
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
      ...(countData && { counts: countData.countsSelect }),
    } as const;

    // Build query - only join count subqueries when includeCounts is true
    let query = db.select(selectShape).from(organizationsTable).innerJoin(membershipsTable, membershipOn);

    if (countData) {
      query = query
        .leftJoin(countData.memberCountsSubquery, eq(organizationsTable.id, countData.memberCountsSubquery.id))
        .leftJoin(countData.relatedCountsSubquery, eq(organizationsTable.id, countData.relatedCountsSubquery.id));
    }

    const organizations = await query
      .where(and(...orgWhere))
      .orderBy(orderColumn)
      .limit(limit)
      .offset(offset);

    // Enrich organizations with can object using batch permission check
    const { results } = isPermissionAllowed(getContextMemberships(), 'read', organizations, {
      systemRole: userSystemRole,
    });
    const organizationsWithCan = organizations.map((org) => {
      const permResult = results.get(org.id);
      return { ...org, can: permResult?.can };
    });

    return ctx.json({ items: organizationsWithCan, total }, 200);
  })

  /**
   * Get organization by id or slug
   */
  .openapi(organizationRoutes.getOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, membership, can } = await getValidContextEntity(idOrSlug, 'organization', 'read');

    const counts = await getEntityCounts(organization.entityType, organization.id);
    const data = { ...organization, membership, counts, can };

    return ctx.json(data, 200);
  })
  /**
   * Update an organization by id or slug
   */
  .openapi(organizationRoutes.updateOrganization, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const { entity: organization, membership, can } = await getValidContextEntity(idOrSlug, 'organization', 'update');
    const user = getContextUser();

    const updatedFields = ctx.req.valid('json');
    const slug = updatedFields.slug;

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable)
        throw new AppError(409, 'slug_exists', 'warn', {
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

    // Event emitted via CDC -> activities table -> activityBus ('organization.updated')
    logEvent('info', 'Organization updated', { organizationId: updatedOrganization.id });

    const counts = await getEntityCounts(organization.entityType, organization.id);
    const data = { ...updatedOrganization, membership, counts, can };

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
    if (!toDeleteIds.length) throw new AppError(400, 'invalid_request', 'error', { entityType: 'organization' });

    // Split ids into allowed and disallowed
    const { allowedIds, disallowedIds: rejectedItemIds } = await splitByAllowance(
      'delete',
      'organization',
      toDeleteIds,
      memberships,
    );
    if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });

    // Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    // Event emitted via CDC -> activities table -> activityBus ('organization.deleted')
    logEvent('info', 'Organizations deleted', allowedIds);

    return ctx.json({ success: true, rejectedItemIds }, 200);
  });

export default organizationRouteHandlers;
