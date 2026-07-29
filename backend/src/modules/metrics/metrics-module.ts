import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'metrics',
  owner: 'cella',
  scope: ['backend'],
  description: 'Endpoints for retrieving high-level counts for entities such as users and organizations.',
});
