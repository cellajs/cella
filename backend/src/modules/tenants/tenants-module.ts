import { defineBackendModule } from '#/lib/module';
import { removeDueTenants } from '#/modules/tenants/operations/remove-due-tenants';
import { demoHandlers, tenantHandlers } from '#/modules/tenants/tenants-handlers';

defineBackendModule({
  name: 'tenants',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Tenants: the top-level isolation boundaries Row-Level Security (RLS) partitions data by. A tenant holds
    one organization and carries its quotas, rate limits and sign-in policy. Its kind says what it is for: live for
    customers, test for staff and automated runs, demo for a visitor's throwaway. System admins list and update tenants,
    a signed-in user creates one of their own, a visitor takes a demo, and a tenant deleted past the deleted-tenant
    period or past its expiry is removed with everything in it.`,
  // Hourly, so a demo goes within the hour after its expiry; the deleted ones go in the same pass.
  jobs: [{ name: 'tenants-removal', cron: '30 * * * *', run: () => removeDueTenants() }],
  routes: [
    { path: '/tenants', app: tenantHandlers },
    { path: '/demos', app: demoHandlers },
  ],
});
