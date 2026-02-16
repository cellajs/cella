import { appConfig } from 'shared';
import type { ContextEntityBase, MembershipBase } from '~/api.gen';
import type { EntityRoute } from '~/modules/navigation/types';
import { baseEntityRoutes } from '~/routes-config';

/**
 * Get the slug for a context entity from membership.
 * Uses entitySlugColumnKeys to find the correct slug field.
 */
const getEntitySlugFromMembership = (
  entityType: string,
  membership: MembershipBase | null | undefined,
): string | null => {
  if (!membership) return null;
  const slugColumnKey = (appConfig.entitySlugColumnKeys as Record<string, string | undefined>)[entityType];
  if (!slugColumnKey) return null;
  return (membership as unknown as Record<string, string | null>)[slugColumnKey] ?? null;
};

/**
 * App-specific context entity path resolver
 *
 * Since each app has its own entity structure or hierarchy, we need to resolve them dynamically in some cases.
 * For example to get/search entities and for items in the menu sheet.
 *
 * Uses slugs from membership data when available, falling back to entity.id for URLs.
 * This allows building routes without needing to fetch full entity details.
 *
 * Note: Currently cella only has 'organization' as a context entity.
 * When adding new context entity types, update baseEntityRoutes and add corresponding param handling.
 */
export const getContextEntityRoute = (
  item: ContextEntityBase & { membership?: MembershipBase | null },
  _isSubitem?: boolean,
): EntityRoute => {
  const { entityType, id, slug, tenantId, membership } = item;

  const to = baseEntityRoutes[entityType];

  // Try to get slug from membership first (for quick access without entity fetch)
  // Fall back to entity slug, then entity id
  const entitySlug = getEntitySlugFromMembership(entityType, membership) ?? slug ?? id;

  // Organization routes use tenantId and orgSlug params
  // Currently cella only has organization as context entity type
  return { to, params: { tenantId, orgSlug: entitySlug }, search: {} };
};
