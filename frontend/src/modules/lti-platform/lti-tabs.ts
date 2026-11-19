import { useQuery } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { ltiTabId } from 'shared/tools-config';
import { ltiResourceLinksQueryOptions, type ResourceLinkChannel } from '~/modules/lti-platform/query';

/**
 * The tabs of the LTI tools placed in a channel and on, in the order they were placed, each with its resource link; none
 * while the platform is off. `fresh` reads them again on mount, whatever the cache holds.
 */
export function useLtiTabs(channel: ResourceLinkChannel, { fresh = false } = {}) {
  const query = useQuery({
    ...ltiResourceLinksQueryOptions(channel),
    enabled: appConfig.has.ltiPlatform,
    ...(fresh && { refetchOnMount: 'always' as const }),
  });
  const tabs = (query.data?.results ?? [])
    .filter((link) => link.enabled)
    .map((link) => ({ id: ltiTabId(link.installationId), title: link.title, link }));
  return { tabs, query };
}
