import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig, hierarchy, recordFromKeys } from 'config';
import { and, count, eq, getTableColumns, ilike, inArray, type SQL } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextUser, getContextUserSystemRole } from '#/lib/context';
import { AppError } from '#/lib/error';
import { filterWithRejection, takeWithRestriction } from '#/lib/rejection-utils';
import { checkSlugAvailable, checkSlugsAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntityCounts, getEntityCountsSelect } from '#/modules/entities/helpers/get-entity-counts';
import { insertMemberships } from '#/modules/memberships/helpers';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import organizationRoutes from '#/modules/organization/organization-routes';
import { addPermission, getValidContextEntity } from '#/permissions';
import { splitByPermission } from '#/permissions/split-by-permission';
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
    const items = ctx.req.valid('json');

    const user = getContextUser();
    const memberships = getContextMemberships();

    // Count user's existing created orgs
    const createdOrgsCount = memberships.reduce((cnt, m) => {
      return m.contextType === 'organization' && m.createdBy === user.id ? cnt + 1 : cnt;
    }, 0);

    // Organization restriction is hardcoded to max 5 for now
    const availableSlots = 5 - createdOrgsCount;

    // No slots
    if (availableSlots <= 0) throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'organization' });

    // Check slug availability in database
    const slugs = items.map((item) => item.slug);
    const slugAvailability = slugs.length > 0 ? await checkSlugsAvailable(slugs) : new Map();

    // Filter by slug availability, track rejections
    const slugFiltered = filterWithRejection(items, (item) => slugAvailability.get(item.slug) === true, 'slug_exists');

    // Enforce org creation restriction
    const restrictionFiltered = takeWithRestriction(
      slugFiltered.items,
      availableSlots,
      'org_limit_reached',
      slugFiltered.rejectionState,
    );

    // Final items to create and rejection state
    const itemsToCreate = restrictionFiltered.items;
    const rejectionState = restrictionFiltered.rejectionState;

    // If nothing to create, return early
    if (itemsToCreate.length === 0) {
      return ctx.json({ data: [], ...rejectionState }, 201);
    }

    // Batch insert organizations
    const createdOrganizations = await db
      .insert(organizationsTable)
      .values(
        itemsToCreate.map((item) => ({
          name: item.name,
          shortName: item.name,
          slug: item.slug,
          languages: [appConfig.defaultLanguage],
          welcomeText: defaultWelcomeText,
          defaultLanguage: appConfig.defaultLanguage,
          createdBy: user.id,
        })),
      )
      .returning();

    logEvent(
      'info',
      'Organizations created',
      createdOrganizations.map((org) => org.id),
    );

    // Insert memberships
    const membershipInserts = createdOrganizations.map((org) => ({
      userId: user.id,
      createdBy: user.id,
      role: 'admin' as const,
      entity: org,
    }));

    const createdMemberships = await insertMemberships(membershipInserts);

    // Build counts
    const validEntities = hierarchy.getChildren('organization');
    const entitiesCounts = recordFromKeys(validEntities, () => 0);
    const entityRoleCounts = recordFromKeys(appConfig.entityRoles, (role) => (role === 'admin' ? 1 : 0));
    const memberCounts = { ...entityRoleCounts, pending: 0, total: 1 };

    // Creator is admin, grant all permissions
    const can = recordFromKeys(appConfig.entityActions, () => true);

    // Map memberships by organizationId
    const membershipByOrgId = new Map(createdMemberships.map((m) => [m.organizationId, m]));

    const data = createdOrganizations.map((org) => ({
      ...org,
      membership: membershipByOrgId.get(org.id),
      counts: { membership: memberCounts, entities: entitiesCounts },
      can,
    }));

    return ctx.json({ data, ...rejectionState }, 201);
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

    // TODO We should only allow this if you have a relationship to the target user
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

    const orderColumn = getOrderColumn(sort, organizationsTable.id, order, {
      id: organizationsTable.id,
      name: organizationsTable.name,
      createdAt: organizationsTable.createdAt,
      userRole: membershipsTable.role,
    });

    const selectShape = {
      ...getTableColumns(organizationsTable),
      membership: membershipBaseSelect,
      ...(countData && { counts: countData.countsSelect }),
    } as const;

    // Build query - system admin sees all orgs (leftJoin), others only their memberships (innerJoin)
    let query = isSystemAdmin
      ? db.select(selectShape).from(organizationsTable).leftJoin(membershipsTable, membershipOn)
      : db.select(selectShape).from(organizationsTable).innerJoin(membershipsTable, membershipOn);

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
    const organizationsWithCan = addPermission('read', organizations);

    return ctx.json({ items: organizationsWithCan, total }, 200);
  })

  /**
   * Get organization by id or slug
   */
  .openapi(organizationRoutes.getOrganization, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity: organization, membership, can } = await getValidContextEntity(id, 'organization', 'read');

    const counts = await getEntityCounts(organization.entityType, organization.id);
    const data = { ...organization, membership, counts, can };

    return ctx.json(data, 200);
  })
  /**
   * Update an organization by id or slug
   */
  .openapi(organizationRoutes.updateOrganization, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity: organization, membership, can } = await getValidContextEntity(id, 'organization', 'update');
    const user = getContextUser();

    const updatedFields = ctx.req.valid('json');
    const slug = updatedFields.slug;

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable)
        throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
    }

    // TODO-019 sanitize blocknote blocks for welcomeText? How to only allow image urls from our own cdn plus a list from allowed domains?

    const [updatedOrganization] = await db
      .update(organizationsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(organizationsTable.id, organization.id))
      .returning();

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
    const result = await splitByPermission('delete', 'organization', toDeleteIds, memberships);
    const { allowedIds, disallowedIds: rejectedItemIds } = result;

    if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });

    // Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    logEvent('info', 'Organizations deleted', allowedIds);

    return ctx.json({ success: true, rejectedItemIds }, 200);
  });

export default organizationRouteHandlers;
