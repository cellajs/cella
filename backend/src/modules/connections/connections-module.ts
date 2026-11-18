import { defineBackendModule } from '#/lib/module';
import { connectionHandlers, organizationConnectionHandlers } from '#/modules/connections/connections-handlers';

defineBackendModule({
  name: 'connections',
  owner: 'cella',
  scope: ['backend'],
  description: `Connections: the institutions a tenant trusts to assert its members' identities through an SSO
    federation (SURFconext first), and the LTI platforms the app is registered at. System admins create SSO connections
    per tenant; a connection's id is the public entry key of the tenant's SSO sign-in, and its domains decide which
    asserted institution the sign-in accepts. Organization admins register LTI connections with a one-use link.`,
  routes: [
    { path: '/tenants/:tenantId/connections', app: connectionHandlers },
    { path: '/tenants/:tenantId/organizations/:organizationId/connections', app: organizationConnectionHandlers },
  ],
});
