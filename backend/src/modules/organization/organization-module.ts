import { defineBackendModule } from '#/lib/module';
import { organizationHandlers } from './organization-handlers';

defineBackendModule({
  name: 'organizations',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing organizations, which are core channel entities and the highest ancestor
    in the entity hierarchy. Organizations define access boundaries and are typically the primary scope for
    permissions and resource management.`,
  // Absolute `/:tenantId/organizations` paths: mounted at `/` after every static path.
  routes: [{ path: '/', app: organizationHandlers, phase: 'absolute' }],
});
