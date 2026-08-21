import { defineFrontendModule } from '~/lib/module';
import { subscribeUnseenSync } from '~/modules/seen/unseen-sync';

defineFrontendModule({
  name: 'seen',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for tracking entity view counts and marking entities as seen.',
});

// Registered with the module so badge deltas from synced rows start before the first stream notification.
subscribeUnseenSync();
