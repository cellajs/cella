import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'seen',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Endpoints for tracking entity view counts and marking entities as seen by the current user.',
});
