import { onlineManager, queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import { type LtiResourceLink, listLtiResourceLinks, type StartLtiLaunchData, type StartLtiLaunchResponse, startLtiLaunch } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import type { LinkedTab } from '~/modules/common/page/tab-nav';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { queryClient } from '~/query/query-client';
import type { MutationData, QueryData } from '~/query/types';

/** A channel as its resource links are read: by its type and id, in its organization. */
export type ResourceLinkChannel = { id: string; entityType: ChannelEntityType; tenantId: string; organizationId?: string | null };

const ltiPlatformKeys = {
  resourceLinks: (channel: ResourceLinkChannel) => ['lti-platform', 'resource-links', channel.tenantId, channel.id] as const,
  startLaunch: ['lti-platform', 'start-launch'] as const,
};

/** The LTI resource links placed in a channel; off while the app is no LTI platform. */
export const ltiResourceLinksQueryOptions = (channel: ResourceLinkChannel) =>
  queryOptions({
    queryKey: ltiPlatformKeys.resourceLinks(channel),
    queryFn: () =>
      fetchAllPages(
        (page) =>
          listLtiResourceLinks({
            path: { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) },
            query: { ...page, channelType: channel.entityType, channelId: channel.id },
          }),
        syncChunkSize,
      ),
    enabled: appConfig.has.ltiPlatform,
  });

const toTabs = (links: QueryData<LtiResourceLink> | undefined): LinkedTab[] => (links?.results ?? []).map(({ id, title }) => ({ id, text: title }));

/** A channel's resource links as tabs, captioned by their titles. */
export function useLtiResourceLinkTabs(channel: ResourceLinkChannel): LinkedTab[] {
  const { data } = useQuery(ltiResourceLinksQueryOptions(channel));
  return toTabs(data);
}

/**
 * A channel's resource links as tabs, for a layout's tab guard: the cached list, or a fetch while online. A failed read
 * leaves the tabs out; the bar's own query tries again.
 */
export async function loadLtiResourceLinkTabs(channel: ResourceLinkChannel): Promise<LinkedTab[]> {
  if (!appConfig.has.ltiPlatform) return [];
  const options = ltiResourceLinksQueryOptions(channel);
  if (!onlineManager.isOnline()) return toTabs(queryClient.getQueryData(options.queryKey));
  return toTabs(await queryClient.query({ ...options, staleTime: 'static' }).catch(() => undefined));
}

/** Starts a launch of a resource link; the frame that asked shows a failure in place. */
export const useStartLtiLaunchMutation = () =>
  useMutation<StartLtiLaunchResponse, ApiError, MutationData<StartLtiLaunchData>>({
    mutationKey: ltiPlatformKeys.startLaunch,
    mutationFn: ({ path }) => startLtiLaunch({ path }),
    meta: { suppressGlobalErrorToast: true },
  });
