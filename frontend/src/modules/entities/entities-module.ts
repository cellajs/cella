import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for operations across multiple entity types such as users and organizations.',
});
