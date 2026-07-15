import type { ChannelEntityType } from 'shared';

export type EntityRouteEntry = {
  /** Route path template for this entity */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as subitem, navigate to a parent entity's route instead */
  subitemOf?: { entityType: ChannelEntityType; searchParam: string };
};

/**
 * Unified route config for channel entities. `paramName` is used both when the entity is the route
 * target AND when it appears as an ancestor in another entity's route.
 */
export const entityRouteConfig = {
  organization: {
    path: '/$tenantId/$organizationSlug/organization/attachments',
    paramName: 'organizationSlug',
  },
} as const satisfies Record<ChannelEntityType, EntityRouteEntry>;
