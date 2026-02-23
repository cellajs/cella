import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq, getColumns, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { unsafeInternalDb as db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { contextCountersTable } from '#/db/schema/context-counters';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { buildZeroCounts } from '#/modules/entities/helpers/build-zero-counts';
import { checkSlugAvailable, checkSlugsAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntityCounts, getEntityCountsSelect } from '#/modules/entities/helpers/get-entity-counts';
import { initContextCounters } from '#/modules/entities/helpers/init-context-counters';
import { insertMemberships } from '#/modules/memberships/helpers';
import { type MembershipBaseModel, toMembershipBase } from '#/modules/memberships/helpers/select';
import organizationRoutes from '#/modules/organization/organization-routes';
import { getValidContextEntity } from '#/permissions';
import { splitByPermission } from '#/permissions/split-by-permission';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { filterWithRejection, takeWithRestriction } from '#/utils/rejection-utils';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { defaultWelcomeText } from '#json/text-blocks.json';

const app = new OpenAPIHono<Env>({ defaultHook });

const organizationRouteHandlers = app
  /**
   * Create one or more organizations
   */
  .openapi(organizationRoutes.createOrganizations, async (ctx) => {
    const items = ctx.req.valid('json');
    const { tenantId } = ctx.req.valid('param');

    const user = ctx.var.user;
    const userSystemRole = ctx.var.userSystemRole;
    const isSystemAdmin = userSystemRole === 'admin';

    // Count user's org creations from activities (includes deleted orgs)
    const [orgCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.userId, user.id),
          eq(activitiesTable.tableName, 'organizations'),
          eq(activitiesTable.action, 'create'),
        ),
      );
    const createdOrgsCount = orgCountResult?.count ?? 0;

    // Organization restriction is hardcoded to max 5 for now (system admins bypass this)
    const availableSlots = 5 - createdOrgsCount;

    // No slots - system admins can bypass this restriction
    if (!isSystemAdmin && availableSlots <= 0)
      throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'organization' });

    // Check slug availability in database
    const slugs = items.map((item) => item.slug);
    const slugAvailability = slugs.length > 0 ? await checkSlugsAvailable(slugs, db) : new Map();

    // Filter by slug availability, track rejections
    const slugFiltered = filterWithRejection(items, (item) => slugAvailability.get(item.slug) === true, 'slug_exists');

    // Enforce org creation restriction (system admins bypass this)
    const restrictionFiltered = isSystemAdmin
      ? { items: slugFiltered.items, rejectionState: slugFiltered.rejectionState }
      : takeWithRestriction(slugFiltered.items, availableSlots, 'org_limit_reached', slugFiltered.rejectionState);

    // Final items to create and rejection state
    const itemsToCreate = restrictionFiltered.items;
    const rejectionState = restrictionFiltered.rejectionState;

    // If nothing to create, return early
    if (itemsToCreate.length === 0) {
      return ctx.json({ data: [] as never[], ...rejectionState }, 201);
    }

    // Get the RLS-enabled db from tenant guard middleware
    const tx = ctx.var.db;

    // Insert organizations with proper RLS context (all in same tenant from path)
    const createdOrganizations = await tx
      .insert(organizationsTable)
      .values(
        itemsToCreate.map((item) => ({
          name: item.name,
          shortName: item.name,
          slug: item.slug,
          tenantId,
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

    // Insert memberships (using RLS-enabled db from middleware)
    const membershipInserts = createdOrganizations.map((org) => ({
      userId: user.id,
      createdBy: user.id,
      role: 'admin' as const,
      entity: org,
    }));

    const createdMemberships = await insertMemberships(tx, membershipInserts);

    // Initialize context counters (prevents race with CDC processing)
    await initContextCounters(
      'organization',
      createdOrganizations.map((org) => org.id),
    );

    // Build counts for response
    const counts = buildZeroCounts('organization');

    // Map memberships by organizationId
    const membershipByOrgId = new Map(createdMemberships.map((m) => [m.organizationId, m]));

    const data = createdOrganizations.map((org) => {
      // Membership must exist — we just inserted it above
      const membership = membershipByOrgId.get(org.id)!;
      return {
        ...org,
        included: {
          membership: toMembershipBase(membership),
          counts,
        },
      };
    });

    return ctx.json({ data, ...rejectionState }, 201);
  })
  /**
   * Get list of organizations
   */
  .openapi(organizationRoutes.getOrganizations, async (ctx) => {
    const { q, sort, order, offset, limit, relatableUserId, role, excludeArchived, include } = ctx.req.valid('query');

    const entityType = 'organization';

    const user = ctx.var.user;
    const userSystemRole = ctx.var.userSystemRole;
    const memberships = ctx.var.memberships;
    const isSystemAdmin = userSystemRole === 'admin' && !relatableUserId;

    // relatableGuard already verified shared org membership if relatableUserId is provided
    const targetUserId = relatableUserId ?? user.id;

    // Determine what to include
    const includeCounts = include.includes('counts');
    const includeMembership = include.includes('membership');

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

    const orderColumn = getOrderColumn(sort, organizationsTable.id, order, {
      id: organizationsTable.id,
      name: organizationsTable.name,
      createdAt: organizationsTable.createdAt,
      userSystemRole: membershipsTable.role,
    });

    // Get RLS-enabled db from crossTenantGuard middleware
    const tx = ctx.var.db;

    // System admins see all orgs they have RLS access to (via createdBy or membership)
    // They use LEFT JOIN since they may not have a membership row for every org.
    // Regular users use INNER JOIN on memberships (only see orgs they're members of).
    const countData = includeCounts ? getEntityCountsSelect(entityType) : null;
    const selectShape = {
      ...getColumns(organizationsTable),
      ...(countData && { counts: countData.countsSelect }),
      total: sql<number>`count(*) over()`.mapWith(Number),
    } as const;

    // Main query — admin LEFT JOIN vs regular INNER JOIN on memberships
    let query = isSystemAdmin
      ? tx.select(selectShape).from(organizationsTable).leftJoin(membershipsTable, membershipOn)
      : tx.select(selectShape).from(organizationsTable).innerJoin(membershipsTable, membershipOn);

    if (countData) {
      query = query.leftJoin(contextCountersTable, eq(organizationsTable.id, contextCountersTable.contextKey));
    }

    const organizations = await query
      .where(and(...orgWhere))
      .orderBy(orderColumn)
      .limit(limit)
      .offset(offset);

    const total = organizations[0]?.total ?? 0;

    // Build response with included wrapper for optional data
    const items = organizations.map((org) => {
      const { counts, total: _, ...orgData } = org;

      // Build included object based on what was requested
      const included: { membership?: MembershipBaseModel; counts?: typeof counts } = {};

      if (includeMembership) {
        // Find membership from context memberships
        const membership = memberships.find((m) => m.contextType === entityType && m.organizationId === org.id);
        if (membership) {
          included.membership = toMembershipBase(membership);
        }
      }

      if (includeCounts && counts) {
        included.counts = counts;
      }

      return {
        ...orgData,
        included,
      };
    });

    // Enrich organizations with membership data
    return ctx.json({ items, total }, 200);
  })

  /**
   * Get organization by id (tenant-scoped). Pass ?slug=true to resolve by slug.
   */
  .openapi(organizationRoutes.getOrganization, async (ctx) => {
    const { tenantId, organizationId } = ctx.req.valid('param');
    const { slug: bySlug, include } = ctx.req.valid('query');

    // Validate tenantId is provided (early explicit error)
    if (!tenantId) {
      throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'Missing tenantId parameter' } });
    }

    const { entity: organization, membership } = await getValidContextEntity(
      ctx,
      organizationId,
      'organization',
      'read',
      bySlug,
    );

    // Validate organization belongs to the specified tenant
    if (organization.tenantId !== tenantId) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'Tenant mismatch' } });
    }

    // Determine what to include (default: nothing)
    const includeCounts = include.includes('counts');
    const includeMembership = include.includes('membership');

    // Build included object based on what was requested
    const included: Record<string, unknown> = {};

    if (includeCounts) {
      included.counts = await getEntityCounts(organization.entityType, organization.id);
    }

    if (includeMembership && membership) {
      included.membership = toMembershipBase(membership);
    }

    const data = {
      ...organization,
      included,
    };

    return ctx.json(data, 200);
  })
  /**
   * Update an organization by id (tenant-scoped)
   */
  .openapi(organizationRoutes.updateOrganization, async (ctx) => {
    const { tenantId, id } = ctx.req.valid('param');

    // Validate tenantId is provided (early explicit error)
    if (!tenantId) {
      throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'Missing tenantId parameter' } });
    }

    const { entity: organization, membership } = await getValidContextEntity(ctx, id, 'organization', 'update');

    // Validate organization belongs to the specified tenant
    if (organization.tenantId !== tenantId) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'Tenant mismatch' } });
    }

    const user = ctx.var.user;

    const updatedFields = ctx.req.valid('json');
    const slug = updatedFields.slug;

    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(slug, db);
      if (!slugAvailable)
        throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
    }

    // TODO-005 sanitize blocknote blocks for welcomeText? How to only allow image urls from our own cdn plus a list from allowed domains?

    // Use RLS-enabled transaction from tenant guard middleware
    const tx = ctx.var.db;

    const [updatedOrganization] = await tx
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

    // Build included object with membership and counts
    const included = {
      ...(membership && { membership: toMembershipBase(membership) }),
      counts,
    };

    const data = { ...updatedOrganization, included };

    return ctx.json(data, 200);
  })
  /**
   * Delete organizations by ids (tenant-scoped)
   */
  .openapi(organizationRoutes.deleteOrganizations, async (ctx) => {
    const { tenantId } = ctx.req.valid('param');
    const { ids } = ctx.req.valid('json');

    // Validate tenantId is provided (early explicit error)
    if (!tenantId) {
      throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'Missing tenantId parameter' } });
    }

    const memberships = ctx.var.memberships;

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError(400, 'invalid_request', 'error', { entityType: 'organization' });

    // Split ids into allowed and disallowed
    const result = await splitByPermission(ctx, 'delete', 'organization', toDeleteIds, memberships);
    const { allowedIds, disallowedIds: rejectedItemIds } = result;

    if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });

    // Delete the organizations
    await db.delete(organizationsTable).where(inArray(organizationsTable.id, allowedIds));

    logEvent('info', 'Organizations deleted', allowedIds);

    return ctx.json({ data: [] as never[], rejectedItemIds }, 200);
  });

export default organizationRouteHandlers;
