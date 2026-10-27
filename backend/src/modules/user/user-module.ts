import { defineBackendModule } from '#/lib/module';
import { userHandlers } from '#/modules/user/user-handlers';

defineBackendModule({
  name: 'users',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for reading other users: the users who share an organization with the requesting user,
    or every user for a system admin. Unlike channel entities such as organizations, a user is a global entity that is
    not scoped to an organization. Administrative operations on users are system endpoints.`,
  routes: [{ path: '/users', app: userHandlers }],
});
