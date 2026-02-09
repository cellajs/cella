import type { ContextEntityData } from '~/modules/entities/types';
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
export const getContextEntityRoute = (item: ContextEntityData, _isSubitem?: boolean): EntityRoute => {
  const { entityType, id, slug, tenantId } = item;

  const to = baseEntityRoutes[entityType];

  // Organization routes use tenantId and orgId params
  // Currently cella only has organization as context entity type
  return { to, params: { tenantId, orgId: slug || id }, search: {} };
};
