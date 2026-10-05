import type { ChannelEntityType } from 'shared';

export type ChannelRouteEntry = {
  /** Route path template for this entity: its tabbed layout route, so links stay tab-less and
   *  the layout's `beforeLoad` picks the landing tab against the channel's stored arrangement. */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as a subitem, navigate to a parent entity's route. */
  subitemOf?: { entityType: ChannelEntityType; searchParam: string };
};

/**
 * Unified route config for channel entities. `paramName` is used both when the entity is the route
 * target AND when it appears as an ancestor in another entity's route.
 *
 * The one piece of a channel's frontend wiring that stays central: the router types `to` from the
 * literal `path` strings below, and a registry filled at runtime hands back a widened `string`. A
 * channel's menu section, list query and members-table defaults live in its own `<name>-module`
 * file; which tabs its page shows, and the one a link lands on, come from `appConfig.surfaces`.
 * What a notification deep link opens is the product's own `deepLinkParam`, not a channel's.
 */
export const channelRouteConfig = {
  organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' },
} as const satisfies Record<ChannelEntityType, ChannelRouteEntry>;
