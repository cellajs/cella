import { appConfig } from 'shared';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { type EntityRouteEntry, entityRouteConfig } from '~/routes-config';

/**
 * Navigation hint for entity-page links. Spread into a `<Link>` or `navigate()`.
 *
 * `hash`/`hashScrollIntoView` land a new/forward navigation on the page header (`id="pt"`), leaving
 * the cover scrolled just above it. Works with TanStack Router's scroll restoration: on PUSH/REPLACE
 * the router's hash path runs `scrollIntoView` on the header; on history back/forward the cached
 * scroll position is restored and this hint is ignored. The scroll travel itself is masked by the
 * page-enter fade on the org page (see `.animate-page-enter`), not by a view transition (the router's
 * `viewTransition` doesn't capture React's concurrent commit here).
 */
export const pageTopHashNav: { hash: string; hashScrollIntoView: ScrollIntoViewOptions } = {
  hash: 'pt',
  hashScrollIntoView: { block: 'start', behavior: 'instant' },
};

/**
 * Config-driven entity path resolver
 *
 * Resolves an entity to its route using `entityRouteConfig`. Each entity declares
 * its route path, its param name, and optional subitem behavior. Ancestor slugs
 * (populated via cache enrichment) are mapped to params using the same config.
 *
 * When ancestor slugs are unavailable (cache miss), the route's `beforeLoad` +
 * `rewriteUrlToSlug` handles the fallback by redirecting to the slug-based URL after data loads.
 */
export const getContextEntityRoute = (item: EnrichedContextEntity, isSubitem?: boolean): EntityRoute => {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;

  const config = entityRouteConfig[entityType];
  let to = config.path;
  const params: Record<string, string> = { tenantId };
  const search: Record<string, string> = {};

  // Set this entity's slug in its designated param
  params[config.paramName] = slug;

  // Set ancestor slugs in their designated params
  for (const type of appConfig.contextEntityTypes) {
    const ancestorSlug = ancestorSlugs[type];
    if (ancestorSlug) params[entityRouteConfig[type].paramName] = ancestorSlug;
  }

  // Subitem: navigate to parent route with entity slug as search param
  const subitemConfig = isSubitem && 'subitemOf' in config && (config.subitemOf as EntityRouteEntry['subitemOf']);
  if (subitemConfig) {
    const parentSlug = ancestorSlugs[subitemConfig.entityType];
    if (parentSlug) {
      const parentConfig = entityRouteConfig[subitemConfig.entityType];
      to = parentConfig.path;
      params[parentConfig.paramName] = parentSlug;
      search[subitemConfig.searchParam] = slug;
    }
  }

  return { to, params, search };
};
