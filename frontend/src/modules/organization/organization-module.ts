import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'organizations',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing organizations, the highest ancestor in the entity hierarchy.',
});
