import { ChannelSettingsPage } from '~/modules/entities/channel-settings-page';
import type { EnrichedOrganization } from '~/modules/organization/types';

/** Organization settings: the generic channel settings consumer bound to this organization. */
function OrganizationSettings({ organization }: { organization: EnrichedOrganization }) {
  return <ChannelSettingsPage entity={organization} />;
}

export { OrganizationSettings };
