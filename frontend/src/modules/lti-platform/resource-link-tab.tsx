import { useQuery } from '@tanstack/react-query';
import { PageSpinner } from '~/modules/common/spinner';
import { LtiLaunchFrame } from '~/modules/lti-platform/launch-frame';
import { ltiResourceLinksQueryOptions, type ResourceLinkChannel } from '~/modules/lti-platform/query';

/** The tab of one of a channel's LTI resource links: its launch frame, or nothing for an id that names none. */
export function LtiResourceLinkTab({ channel, resourceLinkId }: { channel: ResourceLinkChannel; resourceLinkId: string }) {
  const { data, isPending } = useQuery(ltiResourceLinksQueryOptions(channel));
  if (isPending) return <PageSpinner />;

  const resourceLink = data?.results.find(({ id }) => id === resourceLinkId);
  if (!resourceLink) return null;
  return <LtiLaunchFrame key={resourceLink.id} channel={channel} resourceLink={resourceLink} />;
}
