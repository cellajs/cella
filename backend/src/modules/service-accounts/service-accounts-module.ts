import { defineBackendModule } from '#/lib/module';
import { serviceAccountHandlers } from './service-accounts-handlers';

defineBackendModule({
  name: 'service-accounts',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Machine principals and their API keys. A service account is the actor an API key runs as: bound to
    the organization at a role, disabled rather than deleted, named in provenance like a user. Keys are opaque secrets
    shown once; a key may narrow what its account can do through scopes, never widen it.`,
  routes: [{ path: '/:tenantId/:organizationId/service-accounts', app: serviceAccountHandlers, phase: 'tenant' }],
});
