import type { ChannelEntityType } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { type ChannelRouteEntry, channelRouteConfig } from '~/routes-config';

/**
 * Nav hint for entity-page links: lands forward navigation on the header (`id="pt"`) via
 * `scrollIntoView`; on back/forward the router restores cached scroll and ignores it.
 */
export const pageTopHashNav: { hash: string; hashScrollIntoView: ScrollIntoViewOptions } = {
  hash: 'pt',
  hashScrollIntoView: { block: 'start', behavior: 'instant' },
};

/**
 * Resolve an entity to its route via `channelRouteConfig`. On cache miss, `beforeLoad` +
 * `rewriteUrlToSlug` redirect to the slug URL after load.
 */
export const getChannelRoute = (item: EnrichedChannel, isSubitem?: boolean): EntityRoute => {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;

  // Narrow config keeps `path` a literal route type (for `to`); the widened view exposes the
  // optional `subitemOf`, not a common member when `config` is a union in a deep-hierarchy fork.
  const config = channelRouteConfig[entityType];
  const entry: ChannelRouteEntry = config;

  // `ancestorSlugs` is this entity's exact ancestor set; map each to its route param.
  const params: Record<string, string> = { tenantId };
  for (const [type, ancestorSlug] of Object.entries(ancestorSlugs)) {
    if (ancestorSlug) params[channelRouteConfig[type as ChannelEntityType].paramName] = ancestorSlug;
  }

  // Subitem: render on the parent's page (param already set above) with this entity as search.
  const subitemOf = isSubitem ? entry.subitemOf : undefined;
  if (subitemOf && ancestorSlugs[subitemOf.entityType]) {
    return {
      to: channelRouteConfig[subitemOf.entityType].path,
      params,
      search: { [subitemOf.searchParam]: slug },
    };
  }

  params[config.paramName] = slug;
  return { to: config.path, params, search: {} };
};
