import type { ContextEntityBase } from '~/api.gen';
import type { EntityRoute } from '~/modules/navigation/types';
import { baseEntityRoutes } from '~/routes-config';

/**
 * App-specific context entity path resolver
 *
 * Since each app has its own entity structure or hierarchy, we need to resolve them dynamically in some cases.
 * For example to get/search entities and for items in the menu sheet.
 *
 * Note: Currently cella only has 'organization' as a context entity.
 * When adding new context entity types, update baseEntityRoutes and add corresponding param handling.
 */
export const getContextEntityRoute = (item: ContextEntityBase, _isSubitem?: boolean): EntityRoute => {
  const { entityType, id, slug, tenantId } = item;

  const to = baseEntityRoutes[entityType];

  // Organization routes use tenantId and orgSlug params
  // Currently cella only has organization as context entity type
  return { to, params: { tenantId, orgSlug: slug || id }, search: {} };
};
