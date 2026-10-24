import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'actors',
  owner: 'cella',
  scope: ['backend'],
  description: 'Who writes rows: users and service accounts.',
});
