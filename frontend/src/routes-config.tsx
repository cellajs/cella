import type { ChannelEntityType } from 'shared';
import type { ChannelRouteEntry } from '~/utils/channel-route';

/** Route config per channel entity type; `ChannelRouteEntry` describes an entry. */
export const channelRouteConfig = {
  organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' },
} as const satisfies Record<ChannelEntityType, ChannelRouteEntry>;
