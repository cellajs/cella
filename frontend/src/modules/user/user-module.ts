import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'users',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing users at the system level.',
});
