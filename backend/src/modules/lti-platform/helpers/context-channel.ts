import { appConfig, type ChannelEntityType } from 'shared';
import { ltiContextTypes } from '#/modules/lti-platform/launch-context';
import type { LtiInstallationModel } from '#/modules/lti-platform/lti-installations-db';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

/**
 * The LTI context a resource link launches as: its own channel, with the LIS context types `ltiContextTypes` gives its
 * type; null when that type is no context. A launch names it, and the installation reads its people.
 */
export const linkContext = ({ channelType, channelId }: Pick<LtiResourceLinkModel, 'channelType' | 'channelId'>) => {
  const types = ltiContextTypes(channelType);
  return types && { channelType, channelId, types };
};

/**
 * Whether a channel type holds LTI tabs: a type the app makes an LTI context, and the organization, whose tabs launch
 * without a context when it is none.
 */
export const holdsLtiTabs = (channelType: ChannelEntityType) => channelType === 'organization' || !!ltiContextTypes(channelType);

/** The channel types that hold LTI tabs (`holdsLtiTabs`): those an admin may allow an LTI tool in. */
export const ltiTabChannelTypes = appConfig.channelEntityTypes.filter(holdsLtiTabs);

/**
 * Why an installation may not get a tab in a channel of `channelType`: a type that holds no LTI tabs, or one an admin
 * did not allow it in. Null when it may.
 */
export const ltiTabTypeRefusal = ({ channelTypes }: Pick<LtiInstallationModel, 'channelTypes'>, channelType: ChannelEntityType) =>
  !holdsLtiTabs(channelType)
    ? ('lti_channel_type_holds_no_tabs' as const)
    : !channelTypes.includes(channelType)
      ? ('lti_channel_type_not_allowed' as const)
      : null;

interface LtiTabFacts {
  link: Pick<LtiResourceLinkModel, 'enabled' | 'channelType' | 'channelId'>;
  account: Pick<ServiceAccountModel, 'status'>;
  installation: Pick<LtiInstallationModel, 'approvedAt' | 'channelTypes'>;
  /** The organization's archived channels, as `orgGuard` or `loadArchivedChannelIds` reads them. */
  archivedChannelIds: ReadonlySet<string>;
}

/** Why a tab that exists does not open (`ltiTabClosure`), each an error type with a text of its own. */
export const ltiTabClosures = [
  'lti_tab_switched_off',
  'lti_installation_not_active',
  'lti_tab_type_holds_no_tabs',
  'lti_tab_type_not_allowed',
  'lti_tab_channel_archived',
] as const;

const typeClosures = {
  lti_channel_type_holds_no_tabs: 'lti_tab_type_holds_no_tabs',
  lti_channel_type_not_allowed: 'lti_tab_type_not_allowed',
} as const satisfies Record<NonNullable<ReturnType<typeof ltiTabTypeRefusal>>, (typeof ltiTabClosures)[number]>;

/**
 * Why a tab does not open now, null when it opens: it is switched off, its LTI tool waits for approval or is disabled,
 * its channel's type holds no tabs or is not allowed for it (`ltiTabTypeRefusal`), or its channel is archived. Read
 * where a tab is used: the tab list, the start of a launch, the launch and the binding an LTI tool's token reads members
 * with. Nothing is written when one of these changes: a tab closed by a disabled LTI tool, a withdrawn type or an
 * archive opens again once that is undone.
 */
export const ltiTabClosure = ({ link, account, installation, archivedChannelIds }: LtiTabFacts): (typeof ltiTabClosures)[number] | null => {
  if (!link.enabled) return 'lti_tab_switched_off';
  if (!installation.approvedAt || account.status !== 'active') return 'lti_installation_not_active';
  const typeRefusal = ltiTabTypeRefusal(installation, link.channelType);
  if (typeRefusal) return typeClosures[typeRefusal];
  return archivedChannelIds.has(link.channelId) ? 'lti_tab_channel_archived' : null;
};
