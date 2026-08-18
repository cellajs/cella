import type { ChannelEntityType } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { type ChannelRouteEntry, channelRouteConfig } from '~/routes-config';

/** Nav hint for entity links: lands forward navigation on the header (`id="pt"`); back/forward keeps cached scroll. */
export const pageTopHashNav: { hash: string; hashScrollIntoView: ScrollIntoViewOptions } = {
  hash: 'pt',
  hashScrollIntoView: { block: 'start', behavior: 'instant' },
};

/** Resolves an entity to its route via `channelRouteConfig`; on a cache miss `beforeLoad` rewrites the id URL. */
export const getChannelRoute = (item: EnrichedChannel, isSubitem?: boolean): EntityRoute => {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;

  // Narrow `config` keeps `path` a literal route type; the widened `entry` exposes the optional `subitemOf`.
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
