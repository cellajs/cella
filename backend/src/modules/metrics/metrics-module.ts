import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'metrics',
  owner: 'cella',
  scope: ['backend'],
  description: 'Endpoints for retrieving high-level counts for entities such as users and organizations.',
});
