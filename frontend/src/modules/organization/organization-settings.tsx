import { ChannelSettingsPage } from '~/modules/entities/channel-settings-page';
import type { EnrichedOrganization } from '~/modules/organization/types';

function OrganizationSettings({ organization }: { organization: EnrichedOrganization }) {
  return <ChannelSettingsPage entity={organization} />;
}

export { OrganizationSettings };
