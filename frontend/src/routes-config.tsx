import type { ChannelEntityType } from 'shared';

export type ChannelEntityRouteEntry = {
  /** Route path template for this entity: its canonical landing surface. Also the redirect
   *  target when the entity's tabbed layout route is visited directly (default tab). */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as a subitem, navigate to a parent entity's route. */
  subitemOf?: { entityType: ChannelEntityType; searchParam: string };
};

/**
 * Unified route config for channel entities. `paramName` is used both when the entity is the route
 * target AND when it appears as an ancestor in another entity's route.
 */
export const channelEntityRouteConfig = {
  organization: {
    path: '/$tenantId/$organizationSlug/organization/attachments',
    paramName: 'organizationSlug',
  },
} as const satisfies Record<ChannelEntityType, ChannelEntityRouteEntry>;
