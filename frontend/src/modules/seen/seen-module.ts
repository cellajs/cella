import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'seen',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for tracking entity view counts and marking entities as seen.',
});
