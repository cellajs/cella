import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'domains',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for managing custom domains for tenants, including adding domains and verifying
    ownership. Restricted to system administrators.`,
});
