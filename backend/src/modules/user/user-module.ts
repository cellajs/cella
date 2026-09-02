import { defineBackendModule } from '#/lib/module';
import { userHandlers } from './user-handlers';

defineBackendModule({
  name: 'users',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing users at the system level. Unlike channel entities such as
    organizations, a user is a global entity that is not scoped to a specific context. These endpoints are
    intended for administrative operations on any user in the system.`,
  routes: [{ path: '/users', app: userHandlers }],
});
