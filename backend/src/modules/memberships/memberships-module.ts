import { defineBackendModule } from '#/lib/module';
import { membershipHandlers } from '#/modules/memberships/memberships-handlers';

defineBackendModule({
  name: 'memberships',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing memberships, which represent one-to-one relationships between a
    user and a contextual entity such as an organization. Each membership includes role information and
    status flags such as archived or muted. Memberships can also reference parent entities to easily have a
    hierarchical context available.`,
  routes: [{ path: '/:tenantId/:organizationId/memberships', app: membershipHandlers, phase: 'tenant' }],
  // Sent by the entities stream listeners, which keep each open stream's memberships current in the same step: to the
  // member about their own membership, and as a versioned signal to the organization's readers about its member lists.
  signals: [{ type: 'membership.changed', audiences: ['user', 'readers'] }],
});
