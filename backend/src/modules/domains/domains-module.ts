import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'domains',
  owner: 'cella',
  scope: ['backend'],
  hidden: true,
  description: `Endpoints for managing custom domains for tenants, including adding domains and verifying
    ownership. Restricted to system administrators.`,
});
