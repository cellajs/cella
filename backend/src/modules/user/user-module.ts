import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'users',
  owner: 'cella',
  scope: 'both',
  description: `Endpoints for managing *users* at the system level. Unlike context entities (such as
    \`organizations\`), a \`user\` is a "global" entity and not scoped to a specific context. These endpoints
    are intended for administrative operations on any user in the system.`,
});
