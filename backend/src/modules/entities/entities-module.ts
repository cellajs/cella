import { defineBackendModule } from '#/lib/module';
import { entityHandlers } from './entities-handlers';
import { clearDeletedStorage } from './operations/clear-deleted-storage';

defineBackendModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints that operate across multiple entity types, such as users and organizations.
    Entities are identifiable domain objects that may be contextual, hierarchical (with parent/child
    relations), or actor-like. These routes provide shared logic across modules, including slug validation
    and entity visibility.`,
  // Hourly, at the three-quarter offset clear of the digest's tick.
  jobs: [{ name: 'deleted-storage-cleanup', cron: '45 * * * *', run: () => clearDeletedStorage() }],
  routes: [{ path: '/entities', app: entityHandlers }],
});
