import { useQuery } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { ltiTabId } from 'shared/tools-config';
import { ltiResourceLinksQueryOptions, type ResourceLinkChannel } from '~/modules/lti-platform/query';

/** The tabs of the LTI tools placed in a channel, in the order they were placed, each with its resource link; none while the platform is off. */
export function useLtiTabs(channel: ResourceLinkChannel) {
  const query = useQuery({ ...ltiResourceLinksQueryOptions(channel), enabled: appConfig.has.ltiPlatform });
  const tabs = (query.data?.results ?? []).map((link) => ({ id: ltiTabId(link.installationId), title: link.title, link }));
  return { tabs, query };
}
