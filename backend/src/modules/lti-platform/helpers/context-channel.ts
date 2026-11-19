import type { ChannelEntityType } from 'shared';
import { ltiContextTypes } from '#/modules/lti-platform/launch-context';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';

/**
 * The LTI context a resource link launches as: its own channel, with the LIS context types `ltiContextTypes` gives its
 * type; null when that type is no context. A launch names it, and the installation reads its people.
 */
export const linkContext = ({ channelType, channelId }: Pick<LtiResourceLinkModel, 'channelType' | 'channelId'>) => {
  const types = ltiContextTypes(channelType);
  return types && { channelType, channelId, types };
};

export type LinkContext = NonNullable<ReturnType<typeof linkContext>>;

/**
 * Whether a channel type holds LTI tabs: a type the app makes an LTI context, and the organization, whose tabs launch
 * without a context when it is none.
 */
export const holdsLtiTabs = (channelType: ChannelEntityType) => channelType === 'organization' || !!ltiContextTypes(channelType);
