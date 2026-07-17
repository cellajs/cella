import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { buildZeroCounts } from '#/modules/entities/helpers/build-zero-counts';
import { checkSlugsAvailable } from '#/modules/entities/helpers/check-slug';
import { insertMemberships } from '#/modules/memberships/helpers/membership-helpers';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { withOrganizationFlagDefaults } from '#/modules/organization/helpers/select';
import { countOrgsInTenant, insertOrganizations } from '#/modules/organization/organization-queries';
import { organizationContract } from '#/modules/organization/organization-schema';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { log } from '#/utils/logger';
import { filterWithRejection, takeWithRestriction } from '#/utils/rejection-utils';
import { defaultWelcomeText } from '#json/text-blocks.json';

type CreateOrganizationItem = { id: string; name: string; slug: string };

export async function createOrganizationsOp(ctx: AuthContext, rawItems: CreateOrganizationItem[], tenantId: string) {
  // Lens seam: normalize old-shape field names to their current names before any body access
  const items = rawItems.map((item) => organizationContract.normalizeBody(item));
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const db = ctx.var.db;

  // Count existing organizations in tenant
  const existingOrgsCount = await countOrgsInTenant(ctx, tenantId);

  // 1 tenant = 1 organization. A hard structural invariant (unique index on
  // organizations.tenant_id is the backstop), so it binds system admins too, unlike the soft
  // per-tenant org quota below: a tenant holds at most one org, and a batch creates at most one.
  const tenantOrgSlots = Math.max(0, 1 - existingOrgsCount);

  // Organization quota from tenant restrictions (0 = unlimited; system admins bypass this soft cap).
  const orgQuota = ctx.var.tenant.restrictions.quotas.organization;
  const quotaSlots = orgQuota === 0 ? items.length : orgQuota - existingOrgsCount;

  // The 1:1 invariant clamps everyone (incl. system admins) down to the single remaining slot.
  const availableSlots = Math.min(isSystemAdmin ? items.length : quotaSlots, tenantOrgSlots);

  // No slots: the tenant already has its one org, or (non-admins) the soft quota is exhausted.
  if (availableSlots <= 0) throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'organization' });

  // Check slug availability in database
  const slugs = items.map((item) => item.slug);
  const slugAvailability = slugs.length > 0 ? await checkSlugsAvailable(ctx, slugs, 'organization') : new Map();

  // Filter by slug availability, track rejections
  const slugFiltered = filterWithRejection(items, (item) => slugAvailability.get(item.slug) === true, 'slug_exists');

  // Clamp to the available slots. Applies to everyone: the soft quota is already bypassed for system
  // admins via `availableSlots` above, but the hard 1:1 cap must still bind them, so no admin bypass here.
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
    return { data: [] as never[], ...rejectionState };
  }

  // Insert organizations with proper RLS context (all in same tenant from path)
  const organizationRecords = await insertOrganizations(ctx, {
    orgs: itemsToCreate.map((item) => ({
      name: item.name,
      shortName: item.name,
      slug: item.slug,
      tenantId,
      languages: [appConfig.defaultLanguage],
      welcomeText: defaultWelcomeText,
      defaultLanguage: appConfig.defaultLanguage,
      createdBy: user.id,
    })),
  });

  log.info('Organizations created', {
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

  const createdMemberships = await insertMemberships({ var: { db } }, { items: membershipInserts });

  // Invalidate membership cache so subsequent requests see the new membership
  invalidateCache.user(user.id);

  const counts = buildZeroCounts('organization');

  // Map memberships by organizationId
  const membershipByOrgId = new Map(createdMemberships.map((m) => [m.organizationId, m]));

  const orgsWithAudit = await withAuditUsers(ctx, organizationRecords, user);

  // Build response with included wrapper for optional data (flags stored sparse; merge defaults)
  const organizationResponses = orgsWithAudit.map((org) => {
    const membership = membershipByOrgId.get(org.id)!;
    const included = { membership: toMembershipBase(membership), counts };
    return { ...withOrganizationFlagDefaults(org), included };
  });

  return { data: organizationResponses, ...rejectionState };
}
