import { defineBackendModule } from '#/lib/module';
import { removeArchivedTenants } from './operations/remove-archived-tenants';
import { tenantHandlers } from './tenants-handlers';

defineBackendModule({
  name: 'tenants',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing tenants, which are top-level isolation boundaries used by Row-Level
    Security (RLS) to partition data. Only system administrators can manage tenants.`,
  // Nightly, a quarter-hour after apply_retention() at 03:15 UTC.
  jobs: [{ name: 'archived-tenants-removal', cron: '30 3 * * *', run: () => removeArchivedTenants() }],
  routes: [{ path: '/tenants', app: tenantHandlers }],
});
