import { defineBackendModule } from '#/lib/module';
import { domainHandlers } from './domains-handlers';

defineBackendModule({
  name: 'domains',
  owner: 'cella',
  scope: ['backend'],
  hidden: true,
  description: `Endpoints for managing custom domains for tenants, including adding domains and verifying
    ownership. Restricted to system administrators.`,
  routes: [{ path: '/tenants/:tenantId/domains', app: domainHandlers }],
});
