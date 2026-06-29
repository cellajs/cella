import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'seen',
  owner: 'cella',
  scope: 'both',
  description: 'Endpoints for tracking entity view counts and marking entities as seen by the current user.',
});
