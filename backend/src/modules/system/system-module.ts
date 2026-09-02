import { defineBackendModule } from '#/lib/module';
import { systemHandlers } from './system-handlers';

defineBackendModule({
  name: 'system',
  owner: 'cella',
  scope: ['backend'],
  description: `System level endpoints for administrative actions and platform wide functionality, such as user
    invitations, file uploads, and webhook handling.`,
  routes: [{ path: '/system', app: systemHandlers }],
});
