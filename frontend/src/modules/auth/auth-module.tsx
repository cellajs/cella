import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const securityCards = () => import('~/modules/auth/account/account-security-cards');
const AccountSessionsCard = lazyNamed(securityCards, 'AccountSessionsCard');
const AccountAuthenticationCard = lazyNamed(securityCards, 'AccountAuthenticationCard');

defineFrontendModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description:
    'Authentication UI supporting multiple sign-in methods, including OAuth and passkeys, with the sessions and sign-in methods of the account page.',
  tools: [
    { slot: 'account.settings', id: 'sessions', label: 'c:sessions', order: 20, render: () => <AccountSessionsCard /> },
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
  ],
});
