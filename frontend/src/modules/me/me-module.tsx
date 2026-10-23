import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const accountTools = () => import('~/modules/me/account-tools');
const AccountGeneralCard = lazyNamed(accountTools, 'AccountGeneralCard');
const AccountSessionsCard = lazyNamed(accountTools, 'AccountSessionsCard');
const AccountAuthenticationCard = lazyNamed(accountTools, 'AccountAuthenticationCard');
const AccountConnectedAppsCard = lazyNamed(accountTools, 'AccountConnectedAppsCard');
const AccountDeleteCard = lazyNamed(accountTools, 'AccountDeleteCard');

defineFrontendModule({
  name: 'me',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for current user profile, settings, and account management.',
  tools: [
    {
      slot: 'account.settings',
      id: 'general',
      label: 'c:general',
      order: 10,
      locked: true,
      render: () => <AccountGeneralCard />,
    },
    {
      slot: 'account.settings',
      id: 'sessions',
      label: 'c:sessions',
      order: 20,
      render: () => <AccountSessionsCard />,
    },
    ...(appConfig.enabledAuthStrategies.length
      ? [
          {
            slot: 'account.settings',
            id: 'authentication',
            label: 'c:authentication',
            order: 30,
            render: () => <AccountAuthenticationCard />,
          } as const,
        ]
      : []),
    ...(appConfig.services.oauth.enabled
      ? [
          {
            slot: 'account.settings',
            id: 'connected-apps',
            label: 'c:connected_apps',
            order: 40,
            render: () => <AccountConnectedAppsCard />,
          } as const,
        ]
      : []),
    {
      slot: 'account.settings',
      id: 'delete-account',
      label: 'c:delete_account',
      order: 90,
      locked: true,
      render: () => <AccountDeleteCard />,
    },
  ],
});
