import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'memberships',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing memberships, which represent one-to-one relationships between a
    user and a contextual entity such as an organization. Each membership includes role information and
    status flags such as archived or muted. Memberships can also reference parent entities to easily have a
    hierarchical context available.`,
});
