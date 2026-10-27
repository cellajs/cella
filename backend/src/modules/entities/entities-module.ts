import { defineBackendModule } from '#/lib/module';
import { entityHandlers } from '#/modules/entities/entities-handlers';
import { clearDeletedStorage } from '#/modules/entities/operations/clear-deleted-storage';

defineBackendModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints that operate across multiple entity types, such as users and organizations.
    Entities are identifiable domain objects that may be contextual, hierarchical (with parent/child
    relations), or actor-like. These routes check slug availability and serve the app stream and its catchup,
    which tell a signed-in client about changes to the entities it may read.`,
  // Hourly, at the three-quarter offset clear of the digest's tick.
  jobs: [{ name: 'deleted-storage-cleanup', cron: '45 * * * *', run: () => clearDeletedStorage() }],
  routes: [{ path: '/entities', app: entityHandlers }],
});
