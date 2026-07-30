import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const AccountGeneralCard = lazyNamed(() => import('~/modules/me/account-tools'), 'AccountGeneralCard');
const AccountSessionsCard = lazyNamed(() => import('~/modules/me/account-tools'), 'AccountSessionsCard');
const AccountAuthenticationCard = lazyNamed(() => import('~/modules/me/account-tools'), 'AccountAuthenticationCard');
const AccountDeleteCard = lazyNamed(() => import('~/modules/me/account-tools'), 'AccountDeleteCard');

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
    // Authentication only registers when at least one auth strategy is enabled
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
