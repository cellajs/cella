import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'activities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for viewing audit log entries and activity streams.',
});
