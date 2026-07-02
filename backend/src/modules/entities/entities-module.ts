import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints that operate across multiple entity types, such as users and organizations.
    Entities are identifiable domain objects that may be contextual, hierarchical (with parent/child
    relations), or actor-like. These routes provide shared logic across modules, including slug validation
    and entity visibility.`,
});
