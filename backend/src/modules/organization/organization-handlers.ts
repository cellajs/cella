import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq, getColumns, ilike, type SQL, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { contextCountersTable } from '#/db/schema/context-counters';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { buildZeroCounts } from '#/modules/entities/helpers/build-zero-counts';
import { checkSlugAvailable, checkSlugsAvailable } from '#/modules/entities/helpers/check-slug';
import { getEntityCounts, getEntityCountsSelect } from '#/modules/entities/helpers/get-entity-counts';
import { insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import { type MembershipBaseModel, toMembershipBase } from '#/modules/memberships/helpers/select';
import {
  countOrgCreationsByUser,
  deleteOrganizationsByIds,
  findVerifiedDomainMatch,
  insertOrganizations,
  updateOrganization,
} from '#/modules/organization/organization-queries';
import organizationRoutes from '#/modules/organization/organization-routes';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import {
  auditUserSelect,
  coalesceAuditUsers,
  createdByUser,
  updatedByUser,
  withAuditUser,
  withAuditUsers,
} from '#/modules/user/helpers/audit-user';
import { getValidContextEntity } from '#/permissions';
import { splitByPermission } from '#/permissions/split-by-permission';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { filterWithRejection, takeWithRestriction } from '#/utils/rejection-utils';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { validateBlockMediaUrls } from '#/utils/validate-block-urls';
import { defaultWelcomeText } from '#json/text-blocks.json';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Create one or more organizations
 */
app.openapi(organizationRoutes.createOrganizations, async (ctx) => {
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;

  const items = ctx.req.valid('json');
  const { tenantId } = ctx.req.valid('param');

  // Prevent creating organizations in the public tenant
  if (tenantId === appConfig.publicTenant.id) {
    throw new AppError(403, 'forbidden', 'warn', {
      meta: { reason: 'Cannot create organizations in public tenant' },
    });
  }

  // Count user's org creations from activities (includes deleted orgs)
  const createdOrgsCount = await countOrgCreationsByUser(baseDb, { userId: user.id });

  // Organization restriction is read from tenant restrictions (system admins bypass this)
  const orgQuota = ctx.var.tenant.restrictions.quotas.organization;
  const availableSlots = orgQuota === 0 ? items.length : orgQuota - createdOrgsCount;

  // No slots - system admins can bypass this restriction
  if (!isSystemAdmin && availableSlots <= 0)
    throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'organization' });

  // Check slug availability in database
  const slugs = items.map((item) => item.slug);
  const slugAvailability = slugs.length > 0 ? await checkSlugsAvailable(baseDb, slugs, 'organization') : new Map();

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

  const db = ctx.var.db;

  // Insert organizations with proper RLS context (all in same tenant from path)
  const organizationRecords = await insertOrganizations(
    db,
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
  );

  logEvent(ctx, 'info', 'Organizations created', {
    count: organizationRecords.length,
    ids: organizationRecords.map((org) => org.id),
  });

  // Insert memberships (using RLS-enabled db from middleware)
  const membershipInserts = organizationRecords.map((org) => ({
    userId: user.id,
    createdBy: user.id,
    role: 'admin' as const,
    entity: org,
  }));

  const createdMemberships = await insertMemberships(db, membershipInserts, ctx);

  const counts = buildZeroCounts('organization');

  // Map memberships by organizationId
  const membershipByOrgId = new Map(createdMemberships.map((m) => [m.organizationId, m]));

  const orgsWithAudit = await withAuditUsers(ctx, organizationRecords, user);

  // Build response with included wrapper for optional data
  const organizationResponses = orgsWithAudit.map((org) => {
    const membership = membershipByOrgId.get(org.id)!;
    const included = { membership: toMembershipBase(membership), counts };
    return { ...org, included };
  });

  return ctx.json({ data: organizationResponses, ...rejectionState }, 201);
});

/**
 * Create an organization with auto-tenant creation (for new users without a tenant)
 */
app.openapi(organizationRoutes.autoCreateOrganization, async (ctx) => {
  const user = ctx.var.user;

  const { name, slug, createNewTenant } = ctx.req.valid('json');

  // Check slug availability
  const slugAvailable = await checkSlugAvailable(baseDb, slug, 'organization');
  if (!slugAvailable) {
    throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
  }

  // Extract domain from user email
  const emailDomain = user.email.split('@')[1];

  // Check if a verified domain match exists (unless user explicitly wants a new tenant)
  if (!createNewTenant && emailDomain) {
    const matchedDomain = await findVerifiedDomainMatch(baseDb, { emailDomain });

    if (matchedDomain) {
      throw new AppError(409, 'existing_tenant_found', 'info', {
        meta: { tenantId: matchedDomain.tenantId, tenantName: matchedDomain.tenantName, domain: emailDomain },
      });
    }
  }

  // Auto-create a new tenant for this user
  const tenant = await createTenantForUser(
    baseDb,
    {
      name: `${name} workspace`,
      createdBy: user.id,
      userEmail: user.email,
    },
    ctx,
  );

  // Create organization within the new tenant
  const { org, membership } = await baseDb.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizationsTable)
      .values({
        name,
        shortName: name,
        slug,
        tenantId: tenant.id,
        languages: [appConfig.defaultLanguage],
        welcomeText: defaultWelcomeText,
        defaultLanguage: appConfig.defaultLanguage,
        createdBy: user.id,
      })
      .returning();

    // Insert admin membership
    const createdMemberships = await insertMemberships(
      tx,
      [{ userId: user.id, createdBy: user.id, role: 'admin', entity: org }],
      ctx,
    );

    return { org, membership: createdMemberships[0] };
  });

  const counts = buildZeroCounts('organization');
  const orgWithAudit = await withAuditUser(ctx, org, user);
  const included = { membership: toMembershipBase(membership), counts };
  const result = { ...orgWithAudit, included };

  logEvent(ctx, 'info', 'Organization auto-created with new tenant', {
    organizationId: result.id,
    tenantId: tenant.id,
  });

  return ctx.json(result, 201);
});

/**
 * Get list of organizations
 */
app.openapi(organizationRoutes.getOrganizations, async (ctx) => {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  const { q, sort, order, offset, limit, relatableUserId, role, excludeArchived, include } = ctx.req.valid('query');

  const entityType = 'organization';
  const isSystemAdmin = ctx.var.isSystemAdmin && !relatableUserId;

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
    userRole: membershipsTable.role,
  });

  const db = ctx.var.db;

  // System admins see all orgs they have RLS access to (via createdBy or membership)
  // They use LEFT JOIN since they may not have a membership row for every org.
  // Regular users use INNER JOIN on memberships (only see orgs they're members of).
  const countData = includeCounts ? getEntityCountsSelect(entityType) : null;
  const { createdBy: _cb, updatedBy: _mb, ...orgCols } = getColumns(organizationsTable);
  const selectShape = {
    ...orgCols,
    ...auditUserSelect,
    ...(countData && { counts: countData.countsSelect }),
    total: sql<number>`count(*) over()`.mapWith(Number),
  } as const;

  // Main query — admin LEFT JOIN vs regular INNER JOIN on memberships
  let query = isSystemAdmin
    ? db.select(selectShape).from(organizationsTable).leftJoin(membershipsTable, membershipOn)
    : db.select(selectShape).from(organizationsTable).innerJoin(membershipsTable, membershipOn);

  if (countData) {
    query = query.leftJoin(contextCountersTable, eq(organizationsTable.id, contextCountersTable.contextKey));
  }

  query = query
    .leftJoin(createdByUser, eq(createdByUser.id, organizationsTable.createdBy))
    .leftJoin(updatedByUser, eq(updatedByUser.id, organizationsTable.updatedBy)) as unknown as typeof query;

  const organizations = await query
    .where(and(...orgWhere))
    .orderBy(orderColumn)
    .limit(limit)
    .offset(offset);

  const total = organizations[0]?.total ?? 0;

  // Build response with included wrapper for optional data
  const items = organizations.map((org) => {
    const { counts, total: _, ...orgData } = org;

    const included: { membership?: MembershipBaseModel; counts?: typeof counts } = {};

    if (includeMembership) {
      const membership = memberships.find((m) => m.contextType === entityType && m.organizationId === org.id);
      if (membership) included.membership = toMembershipBase(membership);
    }

    if (includeCounts && counts) included.counts = counts;

    return { ...orgData, included };
  });

  return ctx.json({ items: coalesceAuditUsers(items), total }, 200);
});

/**
 * Get organization by id (tenant-scoped). Pass ?slug=true to resolve by slug.
 */
app.openapi(organizationRoutes.getOrganization, async (ctx) => {
  const user = ctx.var.user;

  const { tenantId, id: organizationId } = ctx.req.valid('param');
  const { slug: bySlug, include } = ctx.req.valid('query');

  const { entity: organization, membership } = await getValidContextEntity(
    ctx,
    organizationId,
    'organization',
    'read',
    bySlug,
  );

  // Validate organization belongs to the specified tenant, in org itself we do not have orgGuard
  if (organization.tenantId !== tenantId) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'Tenant mismatch' } });
  }

  // Determine what to include (default: nothing)
  const includeCounts = include.includes('counts');
  const includeMembership = include.includes('membership');

  const [counts, organizationWithAudit] = await Promise.all([
    includeCounts ? getEntityCounts(organization.entityType, organization.id, ctx.var.db) : undefined,
    withAuditUser(ctx, organization, user),
  ]);

  const included: { counts?: typeof counts; membership?: ReturnType<typeof toMembershipBase> } = {};

  if (counts) included.counts = counts;
  if (includeMembership && membership) included.membership = toMembershipBase(membership);

  return ctx.json({ ...organizationWithAudit, included }, 200);
});

/**
 * Update an organization by id (tenant-scoped)
 */
app.openapi(organizationRoutes.updateOrganization, async (ctx) => {
  const user = ctx.var.user;

  const { tenantId, id } = ctx.req.valid('param');

  const { entity: organization, membership } = await getValidContextEntity(ctx, id, 'organization', 'update');

  // Validate organization belongs to the specified tenant, in org itself we do not have orgGuard
  if (organization.tenantId !== tenantId) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'Tenant mismatch' } });
  }

  const updatedFields = ctx.req.valid('json');
  const slug = updatedFields.slug;

  if (slug && slug !== organization.slug) {
    const slugAvailable = await checkSlugAvailable(baseDb, slug, 'organization');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
  }

  // Validate media URLs in welcomeText are from trusted sources (CDN only)
  // TODO can we simply strip untrusted URLs instead of rejecting the whole request ? This is a better UX but adds complexity and edge cases to handle (e.g. what if all URLs are untrusted and we end up with empty blocks?)
  if (updatedFields.welcomeText) {
    const urlValidation = validateBlockMediaUrls(updatedFields.welcomeText);
    if (!urlValidation.valid) {
      throw new AppError(400, 'invalid_request', 'warn', {
        entityType: 'organization',
        meta: { reason: 'Untrusted media URLs in welcomeText', invalidUrls: urlValidation.invalidUrls.join(', ') },
      });
    }
  }

  const db = ctx.var.db;

  const values = { ...updatedFields, updatedAt: getIsoDate(), updatedBy: user.id };
  const updatedOrganizationRecord = await updateOrganization(db, { id: organization.id, tenantId, values });

  invalidateCache.org(tenantId, organization.id);

  logEvent(ctx, 'info', 'Organization updated', { organizationId: updatedOrganizationRecord.id });

  const counts = await getEntityCounts(organization.entityType, organization.id, db);

  const included = {
    ...(membership && { membership: toMembershipBase(membership) }),
    counts,
  };

  const organizationWithAudit = await withAuditUser(ctx, updatedOrganizationRecord, user);

  return ctx.json({ ...organizationWithAudit, included }, 200);
});

/**
 * Delete organizations by ids (tenant-scoped)
 */
app.openapi(organizationRoutes.deleteOrganizations, async (ctx) => {
  const { ids } = ctx.req.valid('json');

  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  // Split ids into allowed and disallowed
  const result = await splitByPermission(ctx, 'delete', 'organization', toDeleteIds);
  const { allowedIds, rejectedIds } = result;

  const { tenantId } = ctx.req.valid('param');
  await deleteOrganizationsByIds(baseDb, { ids: allowedIds, tenantId });

  for (const id of allowedIds) invalidateCache.org(tenantId, id);

  logEvent(ctx, 'info', 'Organizations deleted', { count: allowedIds.length, ids: allowedIds });

  return ctx.json({ data: [] as never[], rejectedIds }, 200);
});

export { organizationTag } from '#/modules/organization/organization-module';
export const organizationHandlers = app;
