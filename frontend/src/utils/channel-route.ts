import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { findOrganizationByIdOrSlug } from '~/modules/organization/query';
import { channelRouteConfig } from '~/routes-config';

/**
 * One entry of `channelRouteConfig` (`routes-config.tsx`, which apps pin and fill with their channels). `paramName` is
 * used both when the entity is the route target AND when it appears as an ancestor in another entity's route.
 *
 * The one piece of a channel's frontend wiring that stays central: the router types `to` from the literal `path`
 * strings, and a registry filled at runtime hands back a widened `string`. A channel's menu section, list query and
 * members-table defaults live in its own `<name>-module` file; which tabs its page shows, and the one a link lands on,
 * come from `appConfig.surfaces`. What a notification deep link opens is the product's own `deepLinkParam`, not a
 * channel's.
 */
export type ChannelRouteEntry = {
  /** Route path template for this entity: its tabbed layout route, so links stay tab-less and
   *  the layout's `beforeLoad` picks the landing tab against the channel's stored arrangement. */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as a subitem, navigate to a parent entity's route. */
  subitemOf?: { entityType: ChannelEntityType; searchParam: string };
};

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
    return { to: channelRouteConfig[subitemOf.entityType].path, params, search: { [subitemOf.searchParam]: slug } };
  }

  params[config.paramName] = slug;
  return { to: config.path, params, search: {} };
};

/**
 * The org layout's slug rewrite redirects to the bare layout route, dropping any child path, so
 * routes below it need the real org slug; an id is only safe in the target entity's own param.
 */
const orgSlugParam = (organizationId: string, tenantId: string) => findOrganizationByIdOrSlug(organizationId, tenantId)?.slug ?? organizationId;

/**
 * Route to a channel fresh from a create response (no enrichment yet): the org slug comes from
 * cache, the entity's own param takes its server-issued slug.
 * @public
 */
export const getCreatedChannelRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string; slug: string },
): EntityRoute => {
  const config = channelRouteConfig[entityType];
  const params: Record<string, string> = { tenantId: channel.tenantId, organizationSlug: orgSlugParam(channel.organizationId, channel.tenantId) };
  params[config.paramName] = channel.slug;
  return { to: config.path, params, search: {} };
};

/**
 * Route to a channel's nearest ancestor page: the deepest non-null ancestor id column on the row,
 * else the organization. The ancestor id fills the target's own slug param; its `beforeLoad`
 * rewrites the URL to the canonical slug.
 * @public
 */
export const getNearestAncestorRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string } & Record<string, unknown>,
): EntityRoute => {
  const { tenantId, organizationId } = channel;
  const params = { tenantId, organizationSlug: orgSlugParam(organizationId, tenantId) };
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    // Compared as string so a single-channel hierarchy does not narrow `ancestor` to never.
    if ((ancestor as string) === 'organization') break;
    const id = channel[appConfig.entityIdColumnKeys[ancestor]];
    if (typeof id !== 'string') continue;
    const config = channelRouteConfig[ancestor];
    return { to: config.path, params: { ...params, [config.paramName]: id }, search: {} };
  }
  return { to: channelRouteConfig.organization.path, params, search: {} };
};
