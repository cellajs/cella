import { appConfig, type ChannelEntityType } from 'shared';
import { ltiContextTypes } from '#/modules/lti-platform/launch-context';
import type { LtiInstallationModel } from '#/modules/lti-platform/lti-installations-db';
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

/** The channel types that hold LTI tabs (`holdsLtiTabs`): those an admin may allow an LTI tool in. */
export const ltiTabChannelTypes = appConfig.channelEntityTypes.filter(holdsLtiTabs);

/** Whether an installation may get a tab in a channel of `channelType`: the type holds tabs and an admin allowed it there. */
export const allowsLtiTab = ({ channelTypes }: Pick<LtiInstallationModel, 'channelTypes'>, channelType: ChannelEntityType) =>
  holdsLtiTabs(channelType) && channelTypes.includes(channelType);
