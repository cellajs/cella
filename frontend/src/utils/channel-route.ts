import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { findOrganizationByIdOrSlug } from '~/modules/organization/query';
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

/**
 * The org layout's slug rewrite redirects to the bare layout route, dropping any child path, so
 * routes below it need the real org slug; an id is only safe in the target entity's own param.
 */
const orgSlugParam = (organizationId: string, tenantId: string) =>
  findOrganizationByIdOrSlug(organizationId, tenantId)?.slug ?? organizationId;

/**
 * Route to a channel fresh from a create response (no enrichment yet): the org slug comes from
 * cache, the entity's own param takes its server-issued slug.
 */
export const getCreatedChannelRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string; slug: string },
): EntityRoute => {
  const config = channelRouteConfig[entityType];
  const params: Record<string, string> = {
    tenantId: channel.tenantId,
    organizationSlug: orgSlugParam(channel.organizationId, channel.tenantId),
  };
  params[config.paramName] = channel.slug;
  return { to: config.path, params, search: {} };
};

/**
 * Route to a channel's nearest ancestor page: the deepest non-null ancestor id column on the row,
 * else the organization. The ancestor id fills the target's own slug param; its `beforeLoad`
 * rewrites the URL to the canonical slug.
 */
export const getNearestAncestorRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string } & Record<string, unknown>,
): EntityRoute => {
  const { tenantId, organizationId } = channel;
  const params = { tenantId, organizationSlug: orgSlugParam(organizationId, tenantId) };
  // Widened so a single-channel hierarchy does not narrow `ancestor` to never after the root check.
  const rootChannelType: string = hierarchy.rootChannelType;
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    if (ancestor === rootChannelType) break;
    const id = channel[appConfig.entityIdColumnKeys[ancestor]];
    if (typeof id !== 'string') continue;
    const config = channelRouteConfig[ancestor];
    return { to: config.path, params: { ...params, [config.paramName]: id }, search: {} };
  }
  return { to: channelRouteConfig[hierarchy.rootChannelType].path, params, search: {} };
};
