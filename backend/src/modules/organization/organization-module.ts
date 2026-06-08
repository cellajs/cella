import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'organizations',
  owner: 'cella',
  scope: 'both',
  description: `Endpoints for managing \`organizations\`, which are core context entities. Organizations are
    the highest ancestor in the parent hierarchy. They define access boundaries and are often the minimal
    primary scope for permission and resource management.`,
});
