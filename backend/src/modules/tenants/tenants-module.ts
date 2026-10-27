import { defineBackendModule } from '#/lib/module';
import { removeArchivedTenants } from '#/modules/tenants/operations/remove-archived-tenants';
import { tenantHandlers } from '#/modules/tenants/tenants-handlers';

defineBackendModule({
  name: 'tenants',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Tenants: the top-level isolation boundaries Row-Level Security (RLS) partitions data by. A tenant holds
    one organization and carries its quotas, rate limits and sign-in policy. System admins list and update tenants, a
    signed-in user creates one of their own, and an archived tenant is removed after the archived period.`,
  // Nightly, a quarter-hour after apply_retention() at 03:15 UTC.
  jobs: [{ name: 'archived-tenants-removal', cron: '30 3 * * *', run: () => removeArchivedTenants() }],
  routes: [{ path: '/tenants', app: tenantHandlers }],
});
