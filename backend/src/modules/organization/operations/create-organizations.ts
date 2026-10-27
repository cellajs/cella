import type { z } from '@hono/zod-openapi';
import { appConfig, hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { userActorRef, withActorRefs } from '#/modules/actors/actor-refs';
import { buildZeroCounts } from '#/modules/entities/helpers/build-zero-counts';
import { checkSlugsAvailable } from '#/modules/entities/operations/check-slug';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { countOrganizationsByTenant, insertOrganizations } from '#/modules/organization/organization-queries';
import { organizationContract } from '#/modules/organization/organization-schema';
import { log } from '#/utils/logger';
import { filterWithRejection, takeWithRestriction } from '#/utils/rejection-utils';
import { defaultWelcomeText } from '#json/text-blocks.json';

/**
 * Creates organizations in the request's tenant, each with its creator as admin. A tenant holds one organization: the
 * batch takes the free slot and rejects the rest as `slug_exists` or `org_limit_reached`.
 * @throws 403 `restrict_by_app` when the tenant holds its organization already, or its quota is spent for a caller who
 * is not a system admin.
 */
export async function createOrganizationsOp(ctx: UserContext, rawItems: z.infer<typeof organizationContract.createItemSchema>[]) {
  const items = rawItems.map((item) => organizationContract.normalizeBody(item));
  const { user, isSystemAdmin, tenantId } = ctx.var;

  const existingOrgsCount = await countOrganizationsByTenant(ctx, { tenantId });

  // 1 tenant = 1 organization: a hard unique index on organizations.tenant_id, so it binds system admins too.
  const tenantOrgSlots = Math.max(0, 1 - existingOrgsCount);

  // Organization quota from tenant restrictions (0 = unlimited; system admins bypass this soft cap).
  const orgQuota = ctx.var.tenant.restrictions.quotas.organization;
  const quotaSlots = orgQuota === 0 ? items.length : orgQuota - existingOrgsCount;

  const availableSlots = Math.min(isSystemAdmin ? items.length : quotaSlots, tenantOrgSlots);

  if (availableSlots <= 0) throw new AppError(403, 'restrict_by_app', 'warn', { entityType: 'organization' });

  const slugs = items.map((item) => item.slug);
  const slugAvailability = await checkSlugsAvailable(ctx, slugs, 'organization');

  const slugFiltered = filterWithRejection(items, (item) => slugAvailability.get(item.slug) === true, 'slug_exists');

  const restrictionFiltered = takeWithRestriction(slugFiltered.items, availableSlots, 'org_limit_reached', slugFiltered.rejectionState);

  const itemsToCreate = restrictionFiltered.items;
  const rejectionState = restrictionFiltered.rejectionState;

  if (itemsToCreate.length === 0) {
    return { data: [], ...rejectionState };
  }

  const creatorRole = 'admin' as const;

  // An organization and its creator's membership commit together: an organization left without its admin would hold
  // the tenant's one slot where only a system admin reaches it.
  const { organizationRecords, createdMemberships } = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const organizationRecords = await insertOrganizations(txCtx, {
      orgs: itemsToCreate.map((item) => ({
        name: item.name,
        shortName: item.name,
        slug: item.slug,
        tenantId,
        languages: [appConfig.defaultLanguage],
        welcomeText: defaultWelcomeText,
        defaultLanguage: appConfig.defaultLanguage,
        createdBy: user.id,
        // A draft holds its invitations until it is published
        ...(item.draft && hierarchy.canDraft('organization') && { publishedAt: null }),
      })),
    });
    const membershipInserts = organizationRecords.map((org) => ({ userId: user.id, createdBy: user.id, role: creatorRole, entity: org }));
    const createdMemberships = await insertMemberships(txCtx, { items: membershipInserts });
    return { organizationRecords, createdMemberships };
  });

  log.info('Organizations created', { count: organizationRecords.length, ids: organizationRecords.map((org) => org.id) });
  invalidateCache.user(user.id);

  const counts = buildZeroCounts('organization', creatorRole);

  const membershipByOrgId = new Map(createdMemberships.map((membership) => [membership.organizationId, membership]));

  const orgsWithAudit = await withActorRefs(ctx, organizationRecords, [userActorRef(user)]);

  const organizationResponses = orgsWithAudit.map((org) => {
    const membership = membershipByOrgId.get(org.id)!;
    const included = { membership: toMembershipBase(membership), counts };
    return { ...withOrganizationDefaults(org), included };
  });

  return { data: organizationResponses, ...rejectionState };
}
