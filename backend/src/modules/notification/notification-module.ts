import { defineBackendModule } from '#/lib/module';
import { runDigest } from './digest/run-digest';
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
  // Hourly: each run decides per user whether a digest is due, so a missed hour is picked up by the next tick.
  jobs: [{ name: 'notification-digest', cron: '0 * * * *', run: () => runDigest() }],
  routes: [{ path: '/notifications', app: notificationHandlers }],
});
