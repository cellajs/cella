import type { ChannelEntityType } from 'shared';
import type { ChannelRouteEntry } from '~/utils/channel-route';

/** Route config per channel entity type; `ChannelRouteEntry` describes an entry. */
export const channelRouteConfig = {
  organization: { path: '/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' },
} as const satisfies Record<ChannelEntityType, ChannelRouteEntry>;

/**
 * The embedded page per channel type, which an LTI platform shows in its frame once a launch finished
 * (`getEmbeddedChannelRoute`). The channel type an LTI context becomes needs one; any other type opens its
 * organization's page.
 */
export const embeddedChannelRouteConfig = {
  organization: { path: '/embed/$tenantId/$organizationSlug/organization', paramName: 'organizationSlug' },
} as const satisfies Partial<Record<ChannelEntityType, ChannelRouteEntry>> & { organization: ChannelRouteEntry };
