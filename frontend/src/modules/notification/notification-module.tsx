import { defineFrontendModule } from '~/lib/module';
import { registerNotificationSyncListener } from '~/modules/notification/sync-listener';
import { lazyNamed } from '~/utils/lazy-named';

const AccountNotificationsCard = lazyNamed(
  () => import('~/modules/notification/account-notifications-card'),
  'AccountNotificationsCard',
);

// Module files are glob-imported eagerly at boot, so the inbox tracks synced rows before first render.
registerNotificationSyncListener();

defineFrontendModule({
  name: 'notifications',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Inbox for mentions and addressed activity, plus email and digest preferences.',
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
