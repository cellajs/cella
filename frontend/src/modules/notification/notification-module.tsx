import { defineFrontendModule } from '~/lib/module';
import { invalidateNotifications } from '~/modules/notification/query';
import { lazyNamed } from '~/utils/lazy-named';

const AccountNotificationsCard = lazyNamed(() => import('~/modules/notification/account-notifications-card'), 'AccountNotificationsCard');

defineFrontendModule({
  name: 'notifications',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Inbox for mentions and addressed activity, plus email and digest preferences.',
  signals: {
    'notification.created': () => invalidateNotifications(),
    'notification.read': () => invalidateNotifications(),
  },
  tools: [
    {
      slot: 'account.settings',
      id: 'notifications',
      label: 'c:notifications',
      // Between authentication (30) and the delete-account danger zone (90).
      order: 40,
      render: () => <AccountNotificationsCard />,
    },
  ],
});
