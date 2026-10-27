import { defineBackendModule } from '#/lib/module';
import { meHandlers } from '#/modules/me/me-handlers';

defineBackendModule({
  name: 'me',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints scoped to the current user, meaning the user associated with the active session making
    the request. The users endpoints read other users; me endpoints act exclusively on the current user and follow a
    different authorization flow.`,
  routes: [{ path: '/me', app: meHandlers }],
});
