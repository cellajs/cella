import type { ChannelEntityType } from 'shared';

export type ChannelRouteEntry = {
  /** Route path template for this entity: its tabbed layout route, so links stay tab-less and
   *  the layout's `beforeLoad` picks the landing tab against the channel's stored arrangement. */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as a subitem, navigate to a parent entity's route. */
  subitemOf?: { entityType: ChannelEntityType; searchParam: string };
  /** Search params a notification link on this channel opens with, e.g. a product's sheet id keyed by its entity type; the target route's `validateSearch` must declare them or the router strips them. */
  notificationSearch?: (notification: {
    entityType: string;
    subjectId: string;
    /** Grouping context (a comment's host item); null when the subject is its own context. */
    contextId: string | null;
  }) => Record<string, string>;
};

/**
 * Unified route config for channel entities. `paramName` is used both when the entity is the route
 * target AND when it appears as an ancestor in another entity's route.
 *
 * The one piece of a channel's frontend wiring that stays central: the router types `to` from the
 * literal `path` strings below, and a registry filled at runtime hands back a widened `string`. A
 * channel's menu section, list query and members-table defaults live in its own `<name>-module`
 * file; which tabs its page shows, and the one a link lands on, come from `appConfig.surfaces`.
 */
export const channelRouteConfig = {
  organization: {
    path: '/$tenantId/$organizationSlug/organization',
    paramName: 'organizationSlug',
    // The attachments tab reads `attachmentDialogId` and opens that attachment's dialog on top of the grid.
    notificationSearch: ({ entityType, subjectId }): Record<string, string> => (entityType === 'attachment' ? { attachmentDialogId: subjectId } : {}),
  },
} as const satisfies Record<ChannelEntityType, ChannelRouteEntry>;
