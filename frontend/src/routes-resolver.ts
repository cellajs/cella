import type { UserBase } from '~/api.gen';
import type { EntityData } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { baseEntityRoutes } from '~/routes-config';

/**
 * App-specific entity path resolver
 *
 * Since each app has its own entity structure or hierarchy, we need to resolve them dynamically in some cases.
 * For example to get/search entities and for items in the menu sheet.
 */
export const getEntityRoute = (item: EntityData | UserBase, _isSubitem?: boolean): EntityRoute => {
  const { entityType, id, slug } = item;

  const to = baseEntityRoutes[entityType];
  const params = { idOrSlug: slug || id };

  return { to, params, search: {} };
};
