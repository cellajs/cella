import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const ApiKeysCard = lazyNamed(() => import('~/modules/service-accounts/api-keys-card'), 'ApiKeysCard');

defineFrontendModule({
  name: 'service-accounts',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Service accounts and their API keys, managed from organization settings.',
  tools: [
    {
      id: 'api-keys',
      label: 'c:api_keys',
      order: 60,
      // Shown to organization admins: creating machine principals is their act (substrate D9).
      requires: 'update',
      slot: 'organization.settings',
      render: (organization) => <ApiKeysCard organization={organization} />,
    },
  ],
});
