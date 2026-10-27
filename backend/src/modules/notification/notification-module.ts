import { defineBackendModule } from '#/lib/module';
import { notificationHandlers } from '#/modules/notification/notification-handlers';
import { runDigest } from '#/modules/notification/operations/run-digest';
import '#/modules/notification/notification-sources';

defineBackendModule({
  name: 'notifications',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Per-recipient inbox for mentions and addressed activity, plus the daily/weekly
    email digest. Product modules opt in by declaring a notifications source on their own
    defineBackendModule call (who counts as a recipient is the only app-specific part); with no
    source declared the whole module is dormant. Rows are partitioned by createdAt so retention is
    automatic, and excluded from CDC because they are per-user state, not synced content.`,
  jobs: [{ name: 'notification-digest', cron: '0 * * * *', run: () => runDigest() }],
  routes: [{ path: '/notifications', app: notificationHandlers }],
});
