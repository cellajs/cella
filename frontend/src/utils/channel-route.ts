import { type ChannelEntityType, hierarchy, typedEntries } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import type { NotificationLinkSearch } from 'shared/utils/notification-link';
import { getChannelProductRoute, getProductDeepLink } from '~/lib/entity-modules';
import type { AncestorSlugs, EnrichedChannel } from '~/modules/entities/types';
import type { EntityRoute } from '~/modules/navigation/types';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { channelRouteConfig } from '~/routes-config';

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
};

/** Nav hint for entity links: scrolls forward navigation to the header (`id="pt"`), or to the top without one; back/forward keeps cached scroll. */
export const pageTopHashNav: { hash: string; hashScrollIntoView: ScrollIntoViewOptions } = {
  hash: 'pt',
  hashScrollIntoView: { block: 'start', behavior: 'instant' },
};

/** A channel's route with its params and search still readable; `EntityRoute` is what a `Link` takes. */
export type ChannelRoute = { to: EntityRoute['to']; params: Record<string, string>; search: Record<string, string> };

/**
 * Resolves an entity to its route via `channelRouteConfig`. A param the enrichment has not filled with a slug takes
 * the id, the entity's own on a cache miss too: the route's `beforeLoad` rewrites it.
 */
export const getChannelRoute = (item: EnrichedChannel): EntityRoute => resolveChannelRoute(item);

/** The route params of an entity's own page, typed for links to its other routes (its page tabs); `EntityRoute` widens them. */
export const getChannelRouteParams = (item: EnrichedChannel): Record<string, string> => resolveChannelRoute(item).params;

/** The route of an `entityType` page by `channelRouteConfig`. A slug param takes a slug, or an id the route's `beforeLoad` rewrites. */
function buildChannelRoute(entityType: ChannelEntityType, tenantId: string, ancestorSlugs: AncestorSlugs, slug: string): ChannelRoute {
  const params: Record<string, string> = { tenantId };
  for (const [type, ancestorSlug] of typedEntries(ancestorSlugs)) {
    if (ancestorSlug) params[channelRouteConfig[type].paramName] = ancestorSlug;
  }
  const config = channelRouteConfig[entityType];
  params[config.paramName] = slug;
  return { to: config.path, params, search: {} };
}

function resolveChannelRoute(item: EnrichedChannel): ChannelRoute {
  const { entityType, slug, tenantId, ancestorSlugs = {} } = item;
  const slugs: AncestorSlugs = {};
  for (const { type, id } of hierarchy.resolveNonNullAncestors(entityType, asRecord(item))) slugs[type] = ancestorSlugs[type] ?? id;
  return buildChannelRoute(entityType, tenantId, slugs, slug);
}

/**
 * Route to a channel fresh from a create response (no enrichment yet): the organization id fills its param, the
 * entity's own takes its server-issued slug.
 * @public
 */
export const getCreatedChannelRoute = (
  entityType: ChannelEntityType,
  channel: { tenantId: string; organizationId: string; slug: string },
): EntityRoute => buildChannelRoute(entityType, channel.tenantId, { organization: channel.organizationId }, channel.slug);

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
  const [nearest] = hierarchy.resolveNonNullAncestors(entityType, channel);
  return buildChannelRoute(nearest?.type ?? 'organization', tenantId, { organization: organizationId }, nearest?.id ?? organizationId);
};

/**
 * Where a product sits, as a notification or share link carries it: its home channel, and the product to open there.
 * An inbox row's `contextId` is null when the subject has no grouping context.
 */
export type ProductLocation = Omit<NotificationLinkSearch, 'nid' | 'contextId'> & { contextId?: string | null };

/**
 * Search that opens the subject on the target page, from the subject product's `deepLinkParam`. Both its own
 * param and its host's go in: whichever the target route does not declare in `validateSearch`, the router strips.
 */
function getSubjectSearch({ productType, subjectId, contextId }: ProductLocation): Record<string, string> {
  if (!productType || !subjectId) return {};

  const { param, hostParam } = getProductDeepLink(productType);
  // A notification's context defaults to its subject, which names no host
  const hostId = contextId && contextId !== subjectId ? contextId : undefined;
  return { ...(param ? { [param]: subjectId } : {}), ...(hostParam && hostId ? { [hostParam]: hostId } : {}) };
}

/**
 * Route to the page that opens a product: the page its channel's module names (`productRoute`), else the channel's
 * own, with the product opened there.
 */
export function getProductRoute(location: ProductLocation): EntityRoute {
  const route = getChannelProductRoute(location.channelType)?.(location) ?? getChannelPageRoute(location);
  return { ...route, search: { ...route.search, ...getSubjectSearch(location) } };
}

/** A cached channel routes by slug; one not in cache travels by id in its own param and the organization's, which the routes' `beforeLoad` rewrite to slugs. */
function getChannelPageRoute({ tenantId, organizationId, channelType, channelId }: ProductLocation): ChannelRoute {
  const channel = findInCache<EnrichedChannel>(channelType, channelId);
  if (channel) return resolveChannelRoute(channel);
  return buildChannelRoute(channelType, tenantId, { organization: organizationId }, channelId);
}
