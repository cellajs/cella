import { defineFrontendModule } from '~/lib/module';
import { channelSettingsTools } from '~/modules/entities/channel-settings-tools';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationGeneralForm = lazyNamed(
  () => import('~/modules/organization/settings-tools'),
  'OrganizationGeneralForm',
);
const OrganizationDetailsForm = lazyNamed(
  () => import('~/modules/organization/settings-tools'),
  'OrganizationDetailsForm',
);
const OrganizationToolsCard = lazyNamed(() => import('~/modules/organization/settings-tools'), 'OrganizationToolsCard');
const OrganizationDeleteDialog = lazyNamed(
  () => import('~/modules/organization/settings-tools'),
  'OrganizationDeleteDialog',
);

defineFrontendModule({
  name: 'organizations',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing organizations, the highest ancestor in the entity hierarchy.',
  tools: channelSettingsTools({
    channelType: 'organization',
    resource: 'c:organization',
    toolsCardVisibleTo: ['organization.admin'],
    renderGeneral: (organization) => <OrganizationGeneralForm organization={organization} />,
    renderDetails: (organization) => <OrganizationDetailsForm organization={organization} />,
    renderTools: (organization) => <OrganizationToolsCard organization={organization} />,
    renderDeleteDialog: (organization) => <OrganizationDeleteDialog organization={organization} />,
  }),
});
