import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'users',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing users at the system level. Unlike context entities such as
    organizations, a user is a global entity that is not scoped to a specific context. These endpoints are
    intended for administrative operations on any user in the system.`,
});
