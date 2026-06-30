import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'seen',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Endpoints for tracking entity view counts and marking entities as seen by the current user.',
});
