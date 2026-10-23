import { appConfig, type ChannelEntityType, hierarchy, type ProductEntityType } from 'shared';
import { getProductDeepLink } from '~/lib/entity-modules';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { channelRouteConfig } from '~/routes-config';
import { getField } from '~/utils/get-field';

/**
 * One entry of `channelRouteConfig` (`routes-config.tsx`, which apps pin and fill with their channels): the one piece of a
 * channel's frontend configuration that stays central, since the router types `to` from the literal `path` strings and a
 * registry filled at runtime hands back a widened `string`. A channel's menu section, list query and members-table
 * defaults live in its own `<name>-module` file; which tabs its page shows, and the one a link opens, come from
 * `appConfig.surfaces`. What a notification deep link opens is the product's own `deepLinkParam`.
 */
export type ChannelRouteEntry = {
  /** The tabbed layout route, so links stay tab-less and the layout's `beforeLoad` picks the tab from the channel's stored arrangement. */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as a subitem, navigate to a parent entity's route. */
  subitemOf?: { entityType: ChannelEntityType; searchParam: string };
};

/** Nav hint for entity links: scrolls forward navigation to the header (`id="pt"`), or to the top without one; back/forward keeps cached scroll. */
export const pageTopHashNav: { hash: string; hashScrollIntoView: ScrollIntoViewOptions } = {
  hash: 'pt',
  hashScrollIntoView: { block: 'start', behavior: 'instant' },
};

/** A channel's route with its params and search still readable; `EntityRoute` is what a `Link` takes. */
type ChannelRoute = { to: EntityRoute['to']; params: Record<string, string>; search: Record<string, string> };

/**
 * Resolves an entity to its route via `channelRouteConfig`. A param the enrichment has not filled with a slug takes
 * the id, the entity's own on a cache miss too: the route's `beforeLoad` rewrites it.
 */
export const getChannelRoute = (item: EnrichedChannel, isSubitem?: boolean): EntityRoute => resolveChannelRoute(item, isSubitem);

function resolveChannelRoute(item: EnrichedChannel, isSubitem?: boolean): ChannelRoute {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;

  // Narrow `config` keeps `path` a literal route type; the widened `entry` exposes the optional `subitemOf`.
  const config = channelRouteConfig[entityType];
  const entry: ChannelRouteEntry = config;

  // `ancestorSlugs` is this entity's exact ancestor set; map each to its route param.
  const params: Record<string, string> = { tenantId };
  for (const [type, ancestorSlug] of Object.entries(ancestorSlugs)) {
    if (ancestorSlug) params[channelRouteConfig[type as ChannelEntityType].paramName] = ancestorSlug;
  }
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const { paramName } = channelRouteConfig[ancestor];
    const id = getField(item, appConfig.entityIdColumnKeys[ancestor]);
    if (!params[paramName] && typeof id === 'string') params[paramName] = id;
  }

  // Subitem: render on the parent's page (param already set above) with this entity as search.
  const subitemOf = isSubitem ? entry.subitemOf : undefined;
  if (subitemOf && ancestorSlugs[subitemOf.entityType]) {
    return { to: channelRouteConfig[subitemOf.entityType].path, params, search: { [subitemOf.searchParam]: slug } };
  }

  params[config.paramName] = slug;
  return { to: config.path, params, search: {} };
}

/**
 * Route to a channel fresh from a create response (no enrichment yet): the organization id fills its param, the
 * entity's own takes its server-issued slug.
 * @public
 */
export const getCreatedChannelRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string; slug: string },
): EntityRoute => {
  const config = channelRouteConfig[entityType];
  const params: Record<string, string> = { tenantId: channel.tenantId, organizationSlug: channel.organizationId };
  params[config.paramName] = channel.slug;
  return { to: config.path, params, search: {} };
};

/**
 * Route to a channel's nearest ancestor page: the deepest non-null ancestor id column on the row,
 * else the organization. Ids fill the params; each route's `beforeLoad` rewrites its own to the slug.
 * @public
 */
export const getNearestAncestorRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string } & Record<string, unknown>,
): EntityRoute => {
  const { tenantId, organizationId } = channel;
  const params = { tenantId, organizationSlug: organizationId };
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

/** Where a product sits, as a notification or share link carries it: its home channel, and the product to open there. */
export interface ProductLocation {
  tenantId: string;
  organizationId: string;
  channelType: ChannelEntityType;
  channelId: string;
  entityType?: ProductEntityType;
  subjectId?: string;
  /** Grouping context of the subject (a comment's host item); the host opens when the product declares one. */
  contextId?: string | null;
}

/**
 * Search that opens the subject on the target page, from the subject product's `deepLinkParam`. Both its own
 * param and its host's go in: whichever the target route does not declare in `validateSearch`, the router strips.
 */
function getSubjectSearch({ entityType, subjectId, contextId }: ProductLocation): Record<string, string> {
  if (!entityType || !subjectId) return {};

  const { param, hostParam } = getProductDeepLink(entityType);
  return { ...(param ? { [param]: subjectId } : {}), ...(hostParam && contextId ? { [hostParam]: contextId } : {}) };
}

/**
 * Route to a product's channel page with the product opened. A cached channel routes as it does from the menu, a
 * subitem onto its parent's page; one not in cache travels by id in its own param and the organization's, which the
 * routes' `beforeLoad` rewrite to slugs. Null for a channel type without a route.
 */
export function getProductRoute(location: ProductLocation): EntityRoute | null {
  const { tenantId, organizationId, channelType, channelId } = location;
  const config = channelRouteConfig[channelType];
  if (!config) return null;
  const search = getSubjectSearch(location);

  const channel = findInCache<EnrichedChannel>(channelType, channelId);
  if (channel) {
    const route = resolveChannelRoute(channel, true);
    return { ...route, search: { ...route.search, ...search } };
  }

  const params: Record<string, string> = { tenantId, organizationSlug: organizationId };
  params[config.paramName] = channelId;
  return { to: config.path, params, search };
}
