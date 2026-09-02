import { defineBackendModule } from '#/lib/module';
import { seenHandlers, unseenHandlers } from './seen-handlers';

defineBackendModule({
  name: 'seen',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Endpoints for tracking entity view counts and marking entities as seen by the current user.',
  routes: [
    { path: '/unseen', app: unseenHandlers },
    { path: '/:tenantId/:organizationId/seen', app: seenHandlers, phase: 'tenant' },
  ],
});
