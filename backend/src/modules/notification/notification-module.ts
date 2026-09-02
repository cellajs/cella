import { defineBackendModule } from '#/lib/module';
import { scheduleNotificationDigest } from './digest/schedule-digest';
import { notificationHandlers } from './notification-handlers';
import './notification-sources';

defineBackendModule({
  name: 'notifications',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Per-recipient inbox for mentions and addressed activity, plus the daily/weekly
    email digest. Product modules opt in by declaring a notifications source on their own
    defineBackendModule call (who counts as a recipient is the only app-specific part); with no
    source declared the whole module is dormant. Rows are partitioned by createdAt so retention is
    automatic, and excluded from CDC because they are per-user state rather than synced content.`,
  // Exactly one instance sends digests: jobs run on the migration-owning instance only.
  jobs: [{ name: 'notification-digest', start: () => scheduleNotificationDigest() }],
  routes: [{ path: '/notifications', app: notificationHandlers }],
});
