import { defineFrontendModule } from '~/lib/module';
import {
  dangerToolBase,
  detailsToolBase,
  generalToolBase,
  tabsToolBase,
} from '~/modules/entities/channel-settings-tools';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationGeneralCard = lazyNamed(
  () => import('~/modules/organization/settings-tools'),
  'OrganizationGeneralCard',
);
const OrganizationDetailsCard = lazyNamed(
  () => import('~/modules/organization/settings-tools'),
  'OrganizationDetailsCard',
);
const OrganizationTabsCard = lazyNamed(() => import('~/modules/organization/settings-tools'), 'OrganizationTabsCard');
const OrganizationDeleteCard = lazyNamed(
  () => import('~/modules/organization/settings-tools'),
  'OrganizationDeleteCard',
);

defineFrontendModule({
  name: 'organizations',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing organizations, the highest ancestor in the entity hierarchy.',
  tools: [
    {
      ...generalToolBase,
      slot: 'organization.settings',
      render: (organization) => <OrganizationGeneralCard organization={organization} />,
    },
    {
      ...detailsToolBase,
      slot: 'organization.settings',
      render: (organization) => <OrganizationDetailsCard organization={organization} />,
    },
    {
      ...tabsToolBase,
      slot: 'organization.settings',
      render: (organization) => <OrganizationTabsCard organization={organization} />,
    },
    {
      ...dangerToolBase('organization', 'c:organization'),
      slot: 'organization.settings',
      render: (organization) => <OrganizationDeleteCard organization={organization} />,
    },
  ],
});
