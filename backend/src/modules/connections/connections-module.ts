import { defineBackendModule } from '#/lib/module';
import { connectionHandlers } from './connections-handlers';

defineBackendModule({
  name: 'connections',
  owner: 'cella',
  scope: ['backend'],
  description: `Connections: the institutions a tenant trusts to assert its members' identities through an SSO
    federation (SURFconext first). System admins create them per tenant; a connection's id is the public entry key of
    the tenant's SSO sign-in, and its domains decide which asserted institution the sign-in accepts.`,
  routes: [{ path: '/tenants/:tenantId/connections', app: connectionHandlers }],
});
