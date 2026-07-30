import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationGeneralCard = lazyNamed(
  () => import('~/modules/organization/settings-cards'),
  'OrganizationGeneralCard',
);
const OrganizationDetailsCard = lazyNamed(
  () => import('~/modules/organization/settings-cards'),
  'OrganizationDetailsCard',
);
const OrganizationDeleteCard = lazyNamed(
  () => import('~/modules/organization/settings-cards'),
  'OrganizationDeleteCard',
);
const OrganizationToolsCard = lazyNamed(
  () => import('~/modules/organization/tools-settings-card'),
  'OrganizationToolsCard',
);

defineFrontendModule({
  name: 'organizations',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing organizations, the highest ancestor in the entity hierarchy.',
  tools: [
    {
      slot: 'organization.settings.aside',
      id: 'general',
      label: 'c:general',
      order: 10,
      locked: true,
      render: (organization) => <OrganizationGeneralCard organization={organization} />,
    },
    {
      slot: 'organization.settings.aside',
      id: 'details',
      label: 'c:details',
      order: 20,
      render: (organization) => <OrganizationDetailsCard organization={organization} />,
    },
    {
      slot: 'organization.settings.aside',
      id: 'tools',
      label: 'c:tools',
      order: 80,
      locked: true,
      requires: 'update',
      visibleTo: ['organization.admin'],
      render: (organization) => <OrganizationToolsCard organization={organization} />,
    },
    {
      slot: 'organization.settings.aside',
      id: 'delete-organization',
      label: 'c:delete_resource',
      resource: 'c:organization',
      order: 90,
      locked: true,
      requires: 'delete',
      render: (organization) => <OrganizationDeleteCard organization={organization} />,
    },
  ],
});
